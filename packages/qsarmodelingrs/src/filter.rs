use polars::prelude::*;

use crate::error::{QsarError, Result};
use crate::types::FilterSettings;

#[derive(Debug, Clone)]
pub struct FilteredMatrix {
    pub frame: DataFrame,
    pub selected_indices: Vec<usize>,
}

fn series_to_vec(series: &Column) -> Result<Vec<f64>> {
    let series = series.as_materialized_series().cast(&DataType::Float64)?;
    let chunked = series.f64()?;

    if chunked.null_count() > 0 {
        return Err(QsarError::InvalidDataset(format!(
            "Column '{}' contains null values.",
            series.name()
        )));
    }

    Ok(chunked.into_no_null_iter().collect())
}

fn dataframe_to_matrix(frame: &DataFrame) -> Result<Vec<Vec<f64>>> {
    frame
        .get_columns()
        .iter()
        .map(series_to_vec)
        .collect()
}

fn mean(values: &[f64]) -> f64 {
    values.iter().sum::<f64>() / values.len() as f64
}

fn sample_variance(values: &[f64]) -> f64 {
    if values.len() < 2 {
        return 0.0;
    }

    let avg = mean(values);
    let sum_sq = values.iter().map(|value| {
        let delta = value - avg;
        delta * delta
    }).sum::<f64>();
    sum_sq / (values.len() as f64 - 1.0)
}

fn pearson_correlation(lhs: &[f64], rhs: &[f64]) -> f64 {
    if lhs.len() != rhs.len() || lhs.len() < 2 {
        return 0.0;
    }

    let lhs_mean = mean(lhs);
    let rhs_mean = mean(rhs);
    let mut covariance = 0.0;
    let mut lhs_variance = 0.0;
    let mut rhs_variance = 0.0;

    for (lhs_value, rhs_value) in lhs.iter().zip(rhs.iter()) {
        let lhs_delta = lhs_value - lhs_mean;
        let rhs_delta = rhs_value - rhs_mean;
        covariance += lhs_delta * rhs_delta;
        lhs_variance += lhs_delta * lhs_delta;
        rhs_variance += rhs_delta * rhs_delta;
    }

    if lhs_variance == 0.0 || rhs_variance == 0.0 {
        0.0
    } else {
        covariance / (lhs_variance.sqrt() * rhs_variance.sqrt())
    }
}

fn autoscale(values: &[f64]) -> Vec<f64> {
    let avg = mean(values);
    let std_dev = sample_variance(values).sqrt();

    if std_dev == 0.0 {
        return vec![0.0; values.len()];
    }

    values.iter().map(|value| (value - avg) / std_dev).collect()
}

fn lj_cut(value: f64, cut: f64) -> f64 {
    let mut transformed = value / 4.18;
    if transformed >= cut {
        transformed = cut + (transformed - (cut - 1.0)).log10();
    }
    transformed * 4.18
}

fn apply_lj_transform(frame: &DataFrame) -> Result<DataFrame> {
    let columns: Result<Vec<Column>> = frame
        .get_columns()
        .iter()
        .map(|column| {
            let values = series_to_vec(column)?;
            let transformed: Vec<f64> = values.into_iter().map(|value| lj_cut(value, 30.0)).collect();
            Ok(Series::new(column.name().clone(), transformed).into_column())
        })
        .collect();

    Ok(DataFrame::new(columns?)?)
}

pub fn variance_cut(frame: &DataFrame, cut: f64) -> Result<Vec<usize>> {
    if cut == 0.0 {
        return Ok((0..frame.width()).collect());
    }

    let matrix = dataframe_to_matrix(frame)?;
    Ok(matrix
        .iter()
        .enumerate()
        .filter_map(|(index, values)| (sample_variance(values) >= cut).then_some(index))
        .collect())
}

pub fn correlation_cut(frame: &DataFrame, y: &[f64], cut: f64) -> Result<Vec<usize>> {
    let matrix = dataframe_to_matrix(frame)?;
    Ok(matrix
        .iter()
        .enumerate()
        .filter_map(|(index, values)| (pearson_correlation(values, y).abs() >= cut).then_some(index))
        .collect())
}

pub fn autocorrelation_cut(frame: &DataFrame, y: &[f64], cut: f64) -> Result<Vec<usize>> {
    let matrix = dataframe_to_matrix(frame)?;
    let mut dropped = vec![false; matrix.len()];

    for left in 0..matrix.len() {
        for right in (left + 1)..matrix.len() {
            let correlation = pearson_correlation(&matrix[left], &matrix[right]);
            if correlation > cut {
                let left_corr = pearson_correlation(&matrix[left], y).abs();
                let right_corr = pearson_correlation(&matrix[right], y).abs();

                if left_corr < right_corr {
                    dropped[left] = true;
                } else {
                    dropped[right] = true;
                }
            }
        }
    }

    Ok(dropped
        .iter()
        .enumerate()
        .filter_map(|(index, is_dropped)| (!is_dropped).then_some(index))
        .collect())
}

pub fn filter_matrix(frame: &DataFrame, y: &[f64], settings: FilterSettings) -> Result<FilteredMatrix> {
    let mut filtered = if settings.lj_transform {
        apply_lj_transform(frame)?
    } else {
        frame.clone()
    };

    let variance_indices = variance_cut(&filtered, settings.var_cut)?;
    filtered = filtered.select_at_idx_iter(variance_indices.iter().copied()).ok_or_else(|| {
        QsarError::InvalidDataset("Failed to select variance-filtered columns.".to_string())
    })?;

    let corr_indices = correlation_cut(&filtered, y, settings.corr_cut)?;
    filtered = filtered.select_at_idx_iter(corr_indices.iter().copied()).ok_or_else(|| {
        QsarError::InvalidDataset("Failed to select correlation-filtered columns.".to_string())
    })?;

    let autocorr_indices = autocorrelation_cut(&filtered, y, settings.autocorr_cut)?;
    let selected_indices = autocorr_indices;
    filtered = filtered.select_at_idx_iter(selected_indices.iter().copied()).ok_or_else(|| {
        QsarError::InvalidDataset("Failed to select autocorrelation-filtered columns.".to_string())
    })?;

    if filtered.width() == 0 {
        return Err(QsarError::EmptyFilterResult);
    }

    Ok(FilteredMatrix {
        frame: filtered,
        selected_indices,
    })
}

pub fn filter_matrix_from_original(frame: &DataFrame, y: &[f64], settings: FilterSettings) -> Result<FilteredMatrix> {
    filter_matrix(frame, y, settings)
}