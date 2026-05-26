//! Load a [`RawDataset`] from two CSV files.
//!
//! * `X.csv` – descriptor matrix (column-major).
//!   Optional header row (feature names) and/or leading index column (sample labels).
//! * `y.csv` – activity vector; same length as X rows.
//!   Optional header and/or leading index column.
//!
//! Delimiter (`','`, `'\t'`, `';'`, `'|'`), header row, and index column
//! are all detected automatically.
//! ```

use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

use anyhow::{bail, Context, Result};
use csv::ReaderBuilder;
use ndarray::{Array1, Array2, ShapeBuilder};
use polars::prelude::*;

#[derive(Debug, Clone)]
pub struct RawDataset {
    /// Descriptor matrix [n_samples × n_features], **column-major** layout.
    /// Call `.as_standard_layout()` if row-major is needed downstream.
    pub x: Array2<f64>,
    /// Activity vector [n_samples].
    pub y: Array1<f64>,
    /// Compatibility view of `x` for the existing DataFrame-based code paths.
    pub frame: DataFrame,
    pub n_samples: usize,
    pub n_features: usize,
    /// Row labels from the X index column, if present.
    pub row_labels: Option<Vec<String>>,
    /// Feature names from the X header row, if present.
    pub x_labels: Option<Vec<String>>,
    /// Sample labels from the X index column (or y.csv index), if present.
    pub y_labels: Option<Vec<String>>,
}

#[derive(Debug, Clone, Copy)]
pub struct CsvMeta {
    pub delimiter: u8,
    pub has_header: bool,
    pub has_index: bool,
}

/// Read up to `n` non-empty lines from the start of a file, stripping a BOM
/// if present.
fn read_initial_lines(path: &Path, n: usize) -> Result<Vec<String>> {
    let rdr = BufReader::new(
        File::open(path).with_context(|| format!("cannot open '{}'", path.display()))?,
    );
    let mut out = Vec::with_capacity(n);
    for raw in rdr.lines() {
        if out.len() == n {
            break;
        }
        let mut l = raw?;
        // Strip UTF-8 BOM that Excel and some tools emit.
        if out.is_empty() {
            l = l.trim_start_matches('\u{FEFF}').to_string();
        }
        if !l.trim().is_empty() {
            out.push(l);
        }
    }
    Ok(out)
}

/// Pick the delimiter with the highest and most-consistent occurrence count.
///
/// Scores each candidate by `mean * (1 - CV)` where CV is the coefficient of
/// variation across sampled lines.  A consistent delimiter will have low CV
/// and high mean.
fn detect_delimiter(lines: &[String]) -> u8 {
    const CANDS: &[u8] = &[b',', b'\t', b';', b'|'];

    let mut best = b',';
    let mut best_score = f64::NEG_INFINITY;

    for &d in CANDS {
        let counts: Vec<f64> = lines
            .iter()
            .map(|l| l.bytes().filter(|&b| b == d).count() as f64)
            .collect();

        if counts.iter().all(|&c| c > 0.0) {
            let n = counts.len() as f64;
            let mean = counts.iter().sum::<f64>() / n;
            let var = counts.iter().map(|&c| (c - mean).powi(2)).sum::<f64>() / n;
            let cv = if mean > 0.0 { var.sqrt() / mean } else { f64::INFINITY };
            let score = mean * (1.0 - cv.min(1.0));
            if score > best_score {
                best_score = score;
                best = d;
            }
        }
    }
    best
}

#[inline]
fn is_numeric(s: &str) -> bool {
    let s = s.trim();
    !s.is_empty() && s.parse::<f64>().is_ok()
}

/// Infer whether the file has a header row and a leading index column.
///
/// **Header**: any field at position ≥ 1 in row 0 is non-numeric, OR every
/// field in row 0 is non-numeric.
///
/// **Index**: (a) `has_header` and the first header cell is empty or a common
/// sentinel ("id", "index", "name", "sample", …); or (b) the first-column
/// values in data rows contain at least one non-numeric string.
///
/// Sequential-integer index columns are intentionally *not* detected
/// automatically to avoid misclassifying genuinely integer-valued features.
fn detect_header_and_index(lines: &[String], delim: u8) -> (bool, bool) {
    if lines.is_empty() {
        return (false, false);
    }
    let d = delim as char;
    let row0: Vec<&str> = lines[0].split(d).collect();

    let has_header = row0.iter().skip(1).any(|f| !is_numeric(f.trim()))
        || row0.iter().all(|f| !is_numeric(f.trim()));

    let data_start = has_header as usize;

    // Sentinel check on the first header cell.
    const SENTINELS: &[&str] = &["", "index", "idx", "id", "name", "sample", "row", "#"];
    let sentinel = has_header && {
        let h0 = row0[0].trim().to_lowercase();
        SENTINELS.contains(&h0.as_str())
    };

    // Non-numeric values anywhere in the first data column.
    let col0_non_numeric = lines[data_start..]
        .iter()
        .take(10)
        .filter_map(|l| l.split(d).next())
        .any(|v| !is_numeric(v.trim()));

    (has_header, sentinel || col0_non_numeric)
}

fn detect_meta(path: &Path) -> Result<CsvMeta> {
    let lines = read_initial_lines(path, 10)?;
    if lines.is_empty() {
        bail!("'{}' appears to be empty", path.display());
    }
    let delimiter = detect_delimiter(&lines);

    // Sanity: must detect at least 2 fields per line.
    let ncols = lines[0].split(delimiter as char).count();
    if ncols < 2 {
        bail!(
            "'{}': delimiter not detected (tried ',', '\\t', ';', '|'). \
             Got {} field(s) per line with separator '{}'.",
            path.display(),
            ncols,
            delimiter as char
        );
    }

    let (has_header, has_index) = detect_header_and_index(&lines, delimiter);
    Ok(CsvMeta { delimiter, has_header, has_index })
}

/// Public helper used by tests and callers that only need the CSV layout.
pub fn detect_csv_layout(path: &Path) -> Result<CsvMeta> {
    detect_meta(path)
}

fn normalized_label(value: &str) -> String {
    value.trim().trim_matches('"').to_string()
}

fn parse_f64_cell(value: &str, file: &str, row: usize, col: usize) -> Result<f64> {
    let value = value.trim();
    value.parse::<f64>().with_context(|| {
        format!("{file}: cannot parse '{value}' at row {row}, column {col}")
    })
}

fn csv_reader(path: &Path, delimiter: u8, has_headers: bool) -> Result<csv::Reader<File>> {
    let file = File::open(path).with_context(|| format!("cannot open '{}'", path.display()))?;
    Ok(ReaderBuilder::new()
        .delimiter(delimiter)
        .has_headers(has_headers)
        .from_reader(file))
}

fn build_frame_from_x(x: &Array2<f64>, x_labels: Option<&[String]>) -> Result<DataFrame> {
    let nrows = x.nrows();
    let ncols = x.ncols();
    let data = x
        .as_slice_memory_order()
        .context("x is expected to be contiguous in column-major order")?;

    let mut columns: Vec<Column> = Vec::with_capacity(ncols);
    for col in 0..ncols {
        let start = col * nrows;
        let end = start + nrows;
        let name = x_labels
            .and_then(|labels| labels.get(col).cloned())
            .unwrap_or_else(|| format!("x{}", col + 1));
        columns.push(Series::new(name.into(), data[start..end].to_vec()).into_column());
    }

    Ok(DataFrame::new(nrows, columns)?)
}

fn load_x(
    path: &Path,
    meta: CsvMeta,
) -> Result<(Array2<f64>, DataFrame, Option<Vec<String>>, Option<Vec<String>>)> {
    let mut rdr = csv_reader(path, meta.delimiter, meta.has_header)?;

    let x_labels = if meta.has_header {
        let header = rdr.headers()?.clone();
        let start = meta.has_index as usize;
        Some(
            header
                .iter()
                .skip(start)
                .map(normalized_label)
                .collect::<Vec<_>>(),
        )
    } else {
        None
    };

    let mut rows: Vec<Vec<f64>> = Vec::new();
    let mut row_labels: Vec<String> = Vec::new();
    let mut expected_width: Option<usize> = None;

    for (row_idx, record) in rdr.records().enumerate() {
        let record = record.context("parsing X.csv")?;
        let start = meta.has_index as usize;

        if meta.has_index {
            row_labels.push(record.get(0).map(normalized_label).unwrap_or_default());
        }

        let width = record.len().saturating_sub(start);
        if width == 0 {
            bail!("X.csv row {} has no descriptor values", row_idx + 1);
        }

        if let Some(expected) = expected_width {
            if width != expected {
                bail!(
                    "X.csv row {} has {} descriptor values but the first data row has {}",
                    row_idx + 1,
                    width,
                    expected
                );
            }
        } else {
            expected_width = Some(width);
        }

        let mut row = Vec::with_capacity(width);
        for (col_idx, cell) in record.iter().skip(start).enumerate() {
            row.push(parse_f64_cell(cell, "X.csv", row_idx + 1, col_idx + 1)?);
        }
        rows.push(row);
    }

    if rows.is_empty() {
        bail!("'{}' appears to be empty", path.display());
    }

    let nrows = rows.len();
    let ncols = rows[0].len();
    let mut data = vec![0.0; nrows * ncols];
    for (row_idx, row) in rows.iter().enumerate() {
        for (col_idx, value) in row.iter().enumerate() {
            data[col_idx * nrows + row_idx] = *value;
        }
    }

    let x = Array2::from_shape_vec((nrows, ncols).f(), data)
        .context("failed to build Array2 from column-major buffer")?;
    let frame = build_frame_from_x(&x, x_labels.as_deref())?;
    Ok((x, frame, x_labels, if meta.has_index { Some(row_labels) } else { None }))
}

/// Load y.csv as a 1-D vector.
///
/// Polars is not used here: y is a single column (optionally prefixed with an
/// index column), so a streaming BufReader is both simpler and faster.
fn load_y(path: &Path) -> Result<(Array1<f64>, Option<Vec<String>>)> {
    let sample = read_initial_lines(path, 12)?;
    let delim = detect_delimiter(&sample);

    let row0: Vec<&str> = sample
        .first()
        .map(|l| l.split(delim as char).collect())
        .unwrap_or_default();

    let has_header = row0.iter().any(|f| !is_numeric(f.trim()));
    let first_data = has_header as usize;

    // Two columns in data rows → index + value layout.
    let has_index = sample
        .get(first_data)
        .map(|l| l.split(delim as char).count() >= 2)
        .unwrap_or(false);

    let mut rdr = csv_reader(path, delim, has_header)?;
    if has_header {
        let _ = rdr.headers()?;
    }

    let mut values: Vec<f64> = Vec::new();
    let mut labels: Vec<String> = Vec::new();

    for (row_idx, record) in rdr.records().enumerate() {
        let record = record.context("parsing y.csv")?;

        if has_index {
            labels.push(record.get(0).map(normalized_label).unwrap_or_default());
            let value = record.get(1).unwrap_or("");
            values.push(parse_f64_cell(value, "y.csv", row_idx + 1, 1)?);
        } else {
            let value = record.get(0).unwrap_or("");
            values.push(parse_f64_cell(value, "y.csv", row_idx + 1, 1)?);
        }
    }

    Ok((Array1::from_vec(values), if has_index { Some(labels) } else { None }))
}

/// Load a [`RawDataset`] from `x_path` (descriptor matrix) and `y_path`
/// (activity vector).
///
/// Delimiter, header row, and index column are detected automatically for
/// both files.
///
/// # Errors
/// - File cannot be opened or parsed.
/// - Any data column of X cannot be cast to `f64`.
/// - Row counts of X and y do not match.
pub fn load_dataset(x_path: &Path, y_path: &Path) -> Result<RawDataset> {
    let x_meta = detect_meta(x_path).context("sniffing X.csv")?;

    let (x, frame, x_labels, row_labels_x) = load_x(x_path, x_meta).context("loading X.csv")?;
    let (y, y_labels_y) = load_y(y_path).context("loading y.csv")?;

    let n_samples = x.nrows();
    let n_features = x.ncols();

    if y.len() != n_samples {
        bail!(
            "Shape mismatch: X has {n_samples} rows but y has {} elements.",
            y.len()
        );
    }

    // Sample labels: prefer X's index column; fall back to y.csv's index.
    let row_labels = row_labels_x.or(y_labels_y);
    let y_labels = row_labels.clone();

    Ok(RawDataset {
        x,
        y,
        frame,
        n_samples,
        n_features,
        row_labels,
        x_labels,
        y_labels,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn load_dream_dataset() {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let base = manifest.join("examples/data/dream");
        let x = base.join("X.csv");
        let y = base.join("y.csv");

        let ds = load_dataset(&x, &y).expect("load dataset");

        // X.csv is expected to be 37 rows x 408 columns (with index column removed)
        assert_eq!(ds.n_samples, 37, "unexpected number of rows");
        assert_eq!(
            ds.n_features,
            408,
            "unexpected number of descriptors"
        );
        assert!(ds.x_labels.is_some(), "expected feature labels from header");
        assert!(
            ds.row_labels.is_some(),
            "expected row labels from index column"
        );
        assert!(!ds.x.is_standard_layout(), "expected column-major x layout");
        assert_eq!(ds.frame.height(), ds.n_samples, "unexpected frame height");
        assert_eq!(ds.frame.width(), ds.n_features, "unexpected frame width");

        // y should have 37 entries
        assert_eq!(ds.y.len(), ds.n_samples, "unexpected target vector length");
        assert_eq!(ds.y.len(), 37, "unexpected target vector length");
    }

    #[test]
    fn load_carbox_dataset() {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let base = manifest.join("examples/data/carbox");
        let x = base.join("X.csv");
        let y = base.join("y.csv");

        let ds = load_dataset(&x, &y).expect("load dataset");

        assert_eq!(ds.n_samples, 49, "unexpected number of rows");
        assert_eq!(
            ds.n_features,
            12260,
            "unexpected number of descriptors"
        );
        assert_eq!(ds.x.nrows(), 49, "unexpected row count in x");
        assert_eq!(ds.x.ncols(), 12260, "unexpected column count in x");
        assert!(ds.x_labels.is_some(), "expected feature labels from header");
        assert!(ds.row_labels.is_some(), "expected row labels from index column");
        assert_eq!(ds.frame.height(), 49, "unexpected frame height");
        assert_eq!(ds.frame.width(), 12260, "unexpected frame width");

        assert_eq!(ds.y.len(), 49, "unexpected target vector length");
    }

    #[test]
    fn load_carbox_dataset_big() {
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let base = manifest.join("examples/data/carbox");
        let x = base.join("X_big.csv");
        let y = base.join("y.csv");

        let ds = load_dataset(&x, &y).expect("load dataset");

        assert_eq!(ds.n_samples, 49, "unexpected number of rows");
        assert_eq!(
            ds.n_features,
            34820,
            "unexpected number of descriptors"
        );
        assert_eq!(ds.x.nrows(), 49, "unexpected row count in x");
        assert_eq!(ds.x.ncols(), 34820, "unexpected column count in x");
        assert!(!ds.x.is_standard_layout(), "expected column-major x layout");
        assert!(ds.row_labels.is_some(), "expected row labels from index column");
        assert_eq!(ds.frame.height(), 49, "unexpected frame height");
        assert_eq!(ds.frame.width(), 34820, "unexpected frame width");
    }

    #[test]
    fn load_wide_matrix_keeps_column_major_layout() {
        let dir = tempfile::tempdir().expect("tempdir");
        let x = dir.path().join("wide.csv");
        let y = dir.path().join("wide_y.csv");

        std::fs::write(
            &x,
            "id,a,b,c,d,e\nrow1,1,2,3,4,5\nrow2,6,7,8,9,10\n",
        )
        .expect("write X");
        std::fs::write(&y, "0.1\n0.2\n").expect("write y");

        let ds = load_dataset(&x, &y).expect("load dataset");

        assert_eq!(ds.n_samples, 2);
        assert_eq!(ds.n_features, 5);
        assert_eq!(ds.x[[0, 0]], 1.0);
        assert_eq!(ds.x[[1, 0]], 6.0);
        assert_eq!(ds.x[[0, 4]], 5.0);
        assert_eq!(ds.x[[1, 4]], 10.0);
        assert!(!ds.x.is_standard_layout(), "expected column-major x layout");
    }
}
