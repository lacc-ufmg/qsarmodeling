use std::path::PathBuf;

#[test]
fn load_dream_dataset() {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let base = manifest.join("tests/data/dream");
    let x = base.join("X.csv");
    let y = base.join("y.csv");

    let (matrix, yvec) = qsarmodelingrs::load_dataset(&x, &y).expect("load dataset");

    // X.csv is expected to be 37 rows x 408 columns (with index column removed)
    assert_eq!(matrix.frame.height(), 37, "unexpected number of rows");
    assert_eq!(matrix.frame.width(), 408, "unexpected number of descriptors");
    assert!(matrix.row_labels.is_some(), "expected row labels from index column");

    // y should have 37 entries
    assert_eq!(yvec.len(), 37, "unexpected target vector length");
}
