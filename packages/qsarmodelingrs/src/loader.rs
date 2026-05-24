use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use csv::ReaderBuilder;
use polars::prelude::*;

use crate::error::{QsarError, Result};

const INDEX_KEYWORDS: &[&str] = &[
    "molecules",
    "molecule",
    "index",
    "name",
    "names",
    "molecula",
    "moleculas",
    "molécula",
    "moléculas",
    "label",
    "labels",
    "id",
    "ids",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CsvLayout {
    pub delimiter: u8,
    pub has_header: bool,
    pub has_index: bool,
}

#[derive(Debug, Clone)]
pub struct LoadedMatrix {
    pub frame: DataFrame,
    pub row_labels: Option<Vec<String>>,
    pub layout: CsvLayout,
}

fn is_numeric(value: &str) -> bool {
    value.parse::<f64>().is_ok()
}

fn normalize_cell(cell: &str) -> String {
    cell.trim().trim_matches('"').trim_matches('\'').to_string()
}

fn first_non_empty_lines(path: &Path, count: usize) -> Result<Vec<String>> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let mut lines = Vec::new();

    for line in reader.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        lines.push(line);
        if lines.len() == count {
            break;
        }
    }

    if lines.is_empty() {
        return Err(QsarError::InvalidDataset(format!("File {} is empty.", path.display())));
    }

    Ok(lines)
}

fn detect_delimiter(sample: &str) -> u8 {
    [b',', b';', b'\t', b'|']
        .into_iter()
        .max_by_key(|delimiter| sample.matches(*delimiter as char).count())
        .unwrap_or(b',')
}

pub fn detect_csv_layout(path: impl AsRef<Path>) -> Result<CsvLayout> {
    let path = path.as_ref();
    let lines = first_non_empty_lines(path, 2)?;
    let delimiter = detect_delimiter(&lines[0]);

    let first_row: Vec<String> = lines[0]
        .split(delimiter as char)
        .map(normalize_cell)
        .collect();
    let second_row: Vec<String> = if lines.len() > 1 {
        lines[1]
            .split(delimiter as char)
            .map(normalize_cell)
            .collect()
    } else {
        Vec::new()
    };

    let has_header = first_row.get(1).is_some_and(|value| !is_numeric(value));
    let has_index = second_row
        .first()
        .is_some_and(|value| !is_numeric(value))
        || first_row
            .first()
            .is_some_and(|value| INDEX_KEYWORDS.contains(&value.to_lowercase().as_str()));

    Ok(CsvLayout {
        delimiter,
        has_header,
        has_index,
    })
}

fn build_reader(path: &Path, layout: CsvLayout) -> Result<csv::Reader<File>> {
    Ok(ReaderBuilder::new()
        .has_headers(layout.has_header)
        .delimiter(layout.delimiter)
        .from_path(path)?)
}

fn generate_column_name(index: usize) -> String {
    format!("column_{index}")
}

pub fn load_matrix(path: impl AsRef<Path>) -> Result<LoadedMatrix> {
    let path = path.as_ref();
    let layout = detect_csv_layout(path)?;
    let mut reader = build_reader(path, layout)?;

    let headers: Vec<String> = if layout.has_header {
        reader
            .headers()?
            .iter()
            .map(normalize_cell)
            .collect()
    } else {
        Vec::new()
    };

    let mut row_labels = layout.has_index.then(Vec::new);
    let mut columns: Vec<Vec<f64>> = Vec::new();
    let mut column_names: Vec<String> = Vec::new();
    let mut expected_width: Option<usize> = None;

    for (row_index, record) in reader.records().enumerate() {
        let record = record?;
        let values: Vec<String> = record.iter().map(normalize_cell).collect();
        let width = values.len();

        if expected_width.is_none() {
            expected_width = Some(width);
            let data_width = width.saturating_sub(usize::from(layout.has_index));
            columns = vec![Vec::new(); data_width];
            column_names = if layout.has_header {
                headers
                    .iter()
                    .skip(usize::from(layout.has_index))
                    .map(|name| name.to_string())
                    .collect()
            } else {
                (0..data_width)
                    .map(|index| generate_column_name(index + 1))
                    .collect()
            };
        }

        if Some(width) != expected_width {
            return Err(QsarError::InvalidDataset(format!(
                "Inconsistent row width in {} at row {}.",
                path.display(),
                row_index + 1,
            )));
        }

        if layout.has_index {
            if let Some(labels) = row_labels.as_mut() {
                labels.push(values[0].to_string());
            }
        }

        for (column_index, value) in values.iter().skip(usize::from(layout.has_index)).enumerate() {
            let parsed = value.parse::<f64>().map_err(|_| QsarError::NonNumericValue {
                column: column_names
                    .get(column_index)
                    .cloned()
                    .unwrap_or_else(|| generate_column_name(column_index + 1)),
                row: row_index + 1,
                value: value.to_string(),
            })?;
            columns[column_index].push(parsed);
        }
    }

    if columns.is_empty() {
        return Err(QsarError::InvalidDataset(format!(
            "No data columns found in {}.",
            path.display()
        )));
    }

    let series: Vec<Column> = column_names
        .into_iter()
        .zip(columns)
        .map(|(name, values)| Series::new(name.into(), values).into_column())
        .collect();

    let frame = DataFrame::new(series)?;

    Ok(LoadedMatrix {
        frame,
        row_labels,
        layout,
    })
}

pub fn load_vector(path: impl AsRef<Path>) -> Result<Vec<f64>> {
    let path = path.as_ref();
    let mut reader = ReaderBuilder::new()
        .has_headers(false)
        .delimiter(detect_csv_layout(path)?.delimiter)
        .from_path(path)?;

    let mut values = Vec::new();

    for (row_index, record) in reader.records().enumerate() {
        let record = record?;
        if record.len() != 1 {
            return Err(QsarError::InvalidDataset(format!(
                "Target vector {} must contain exactly one column, found {} at row {}.",
                path.display(),
                record.len(),
                row_index + 1,
            )));
        }

        let value = record.get(0).unwrap_or_default().trim();
        let parsed = value.parse::<f64>().map_err(|_| QsarError::NonNumericValue {
            column: "y".to_string(),
            row: row_index + 1,
            value: value.to_string(),
        })?;
        values.push(parsed);
    }

    if values.is_empty() {
        return Err(QsarError::InvalidDataset(format!(
            "Target vector {} is empty.",
            path.display()
        )));
    }

    Ok(values)
}

pub fn load_dataset(matrix_path: impl AsRef<Path>, vector_path: impl AsRef<Path>) -> Result<(LoadedMatrix, Vec<f64>)> {
    let matrix = load_matrix(matrix_path)?;
    let y = load_vector(vector_path)?;
    Ok((matrix, y))
}