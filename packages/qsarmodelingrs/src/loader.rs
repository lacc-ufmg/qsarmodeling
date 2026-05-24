use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

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

fn read_csv_frame(path: &Path, layout: CsvLayout) -> Result<DataFrame> {
    let file = File::open(path)?;
    Ok(CsvReadOptions::default()
        .with_has_header(layout.has_header)
        .map_parse_options(|parse_options| parse_options.with_separator(layout.delimiter))
        .into_reader_with_file_handle(file)
        .finish()?)
}

fn series_to_f64_values(series: &Column, row_offset: usize) -> Result<Vec<f64>> {
    let materialized = series.as_materialized_series();
    let casted = materialized.cast(&DataType::Float64)?;
    let chunked = casted.f64()?;
    let mut values = Vec::with_capacity(chunked.len());

    for row_index in 0..chunked.len() {
        match chunked.get(row_index) {
            Some(value) => values.push(value),
            None => {
                let raw_value = materialized.get(row_index)?.to_string();
                return Err(QsarError::NonNumericValue {
                    column: materialized.name().to_string(),
                    row: row_offset + row_index + 1,
                    value: raw_value,
                });
            }
        }
    }

    Ok(values)
}

pub fn load_matrix(path: impl AsRef<Path>) -> Result<LoadedMatrix> {
    let path = path.as_ref();
    let layout = detect_csv_layout(path)?;
    let frame = read_csv_frame(path, layout)?;

    if frame.height() == 0 || frame.width() == 0 {
        return Err(QsarError::InvalidDataset(format!(
            "No data columns found in {}.",
            path.display()
        )));
    }

    let (row_labels, data_frame) = if layout.has_index {
        let index_name = frame.get_column_names().first().copied().ok_or_else(|| {
            QsarError::InvalidDataset(format!("No data columns found in {}.", path.display()))
        })?;
        let labels = frame
            .column(index_name)?
            .as_materialized_series()
            .iter()
            .map(|value| value.to_string())
            .collect::<Vec<_>>();

        if frame.width() <= 1 {
            return Err(QsarError::InvalidDataset(format!(
                "No data columns found in {}.",
                path.display()
            )));
        }

        let data_names: Vec<&str> = frame
            .get_column_names()
            .iter()
            .skip(1)
            .map(|name| name.as_str())
            .collect();
        let data_frame = frame.select(data_names)?;
        (Some(labels), data_frame)
    } else {
        (None, frame)
    };

    let columns: Result<Vec<Column>> = data_frame
        .columns()
        .iter()
        .map(|column| {
            series_to_f64_values(column, 0).map(|values| {
                Series::new(column.name().clone(), values).into_column()
            })
        })
        .collect();

    let frame = DataFrame::new(data_frame.height(), columns?)?;

    Ok(LoadedMatrix {
        frame,
        row_labels,
        layout,
    })
}

pub fn load_vector(path: impl AsRef<Path>) -> Result<Vec<f64>> {
    let path = path.as_ref();
    let layout = detect_csv_layout(path)?;
    let file = File::open(path)?;
    let frame = CsvReadOptions::default()
        .with_has_header(false)
        .map_parse_options(|parse_options| parse_options.with_separator(layout.delimiter))
        .into_reader_with_file_handle(file)
        .finish()?;

    if frame.height() == 0 {
        return Err(QsarError::InvalidDataset(format!(
            "Target vector {} is empty.",
            path.display()
        )));
    }

    if frame.width() != 1 {
        return Err(QsarError::InvalidDataset(format!(
            "Target vector {} must contain exactly one column, found {}.",
            path.display(),
            frame.width(),
        )));
    }

    let values = series_to_f64_values(&frame.columns()[0], 0)?;

    Ok(values)
}

pub fn load_dataset(matrix_path: impl AsRef<Path>, vector_path: impl AsRef<Path>) -> Result<(LoadedMatrix, Vec<f64>)> {
    let matrix = load_matrix(matrix_path)?;
    let y = load_vector(vector_path)?;
    Ok((matrix, y))
}
