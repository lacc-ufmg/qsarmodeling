use super::*;
use std::fs::write;

fn write_temp_file(dir: &tempfile::TempDir, name: &str, content: &str) -> std::path::PathBuf {
    let path = dir.path().join(name);
    write(&path, content).expect("write temp file");
    path
}

#[test]
fn detects_header_and_index_columns() {
    let dir = tempfile::tempdir().expect("tempdir");
    let path = write_temp_file(
        &dir,
        "matrix.csv",
        "name,a,b,c\nrow1,1.0,2.0,3.0\nrow2,4.0,5.0,6.0\n",
    );

    let layout = loader::detect_csv_layout(&path).expect("layout");
    assert!(layout.has_header);
    assert!(layout.has_index);
    assert_eq!(layout.delimiter, b',');
}

#[test]
fn loads_matrix_and_vector_and_filters_with_cache() {
    let dir = tempfile::tempdir().expect("tempdir");
    let matrix = write_temp_file(
        &dir,
        "matrix.csv",
        "name,x1,x2,x3\nrow1,1.0,2.0,9.0\nrow2,2.0,4.0,8.5\nrow3,3.0,6.0,8.0\nrow4,4.0,8.0,7.5\n",
    );
    let vector = write_temp_file(&dir, "vector.csv", "1.0\n2.0\n3.0\n4.0\n");

    let mut store = session::SessionStore::new();
    let profile = store.load_dataset(&matrix, &vector).expect("load dataset");

    assert_eq!(profile.rows, 4);
    assert_eq!(profile.descriptors, 3);
    assert_eq!(profile.source, types::DatasetSource::Uploaded);

    let session_id = profile.session_id.clone();
    let filtered = store
        .filter_dataset(
            &session_id,
            FilterSettings {
                var_cut: 0.1,
                corr_cut: 0.0,
                autocorr_cut: 0.8,
                autoscale: true,
                lj_transform: false,
            },
        )
        .expect("filter dataset");

    assert_eq!(filtered.profile.source, types::DatasetSource::Filtered);
    assert!(!filtered.frame.get_column_names().is_empty());

    let cached = store
        .filter_dataset(
            &session_id,
            FilterSettings {
                var_cut: 0.1,
                corr_cut: 0.0,
                autocorr_cut: 0.8,
                autoscale: true,
                lj_transform: false,
            },
        )
        .expect("cached filter dataset");

    assert_eq!(filtered.profile, cached.profile);
    assert_eq!(filtered.frame.shape(), cached.frame.shape());
}

#[test]
fn lj_transform_changes_large_values() {
    let dir = tempfile::tempdir().expect("tempdir");
    let matrix = write_temp_file(
        &dir,
        "matrix.csv",
        "name,x1,x2\nrow1,1.0,200.0\nrow2,2.0,400.0\nrow3,3.0,600.0\n",
    );
    let vector = write_temp_file(&dir, "vector.csv", "1.0\n2.0\n3.0\n");

    let mut store = session::SessionStore::new();
    let profile = store.load_dataset(&matrix, &vector).expect("load dataset");
    let filtered = store
        .filter_dataset(
            &profile.session_id,
            FilterSettings {
                var_cut: 0.0,
                corr_cut: 0.0,
                autocorr_cut: 1.0,
                autoscale: false,
                lj_transform: true,
            },
        )
        .expect("filter dataset");

    let value = filtered
        .frame
        .column("x2")
        .expect("x2 column")
        .as_materialized_series()
        .cast(&polars::prelude::DataType::Float64)
        .expect("float64")
        .f64()
        .expect("f64")
        .get(0)
        .expect("value");

    assert!(value < 200.0);
}
