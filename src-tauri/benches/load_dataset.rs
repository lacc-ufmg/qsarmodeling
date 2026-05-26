use criterion::{criterion_group, criterion_main, Criterion};
use std::hint::black_box;
use std::path::PathBuf;

use qsarmodeling_lib::core::load_dataset;

fn bench_load_dream(c: &mut Criterion) {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let base = manifest.join("examples/data/dream");
    let x = base.join("X.csv");
    let y = base.join("y.csv");

    c.bench_function("load_dream", |b| {
        b.iter(|| {
            let ds = load_dataset(black_box(&x), black_box(&y)).expect("load dream");
            drop(ds);
        })
    });
}

fn bench_load_carbox(c: &mut Criterion) {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let base = manifest.join("examples/data/carbox");
    let x = base.join("X.csv");
    let y = base.join("y.csv");

    c.bench_function("load_carbox", |b| {
        b.iter(|| {
            let ds = load_dataset(black_box(&x), black_box(&y)).expect("load carbox");
            drop(ds);
        })
    });
}

fn bench_load_carbox_big(c: &mut Criterion) {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let base = manifest.join("examples/data/carbox");
    let x = base.join("X_big.csv");
    let y = base.join("y.csv");

    c.bench_function("load_carbox_big", |b| {
        b.iter(|| {
            let ds = load_dataset(black_box(&x), black_box(&y)).expect("load carbox big");
            drop(ds);
        })
    });
}

criterion_group!(
    load_dataset_benches,
    bench_load_dream,
    bench_load_carbox,
    bench_load_carbox_big,
);
criterion_main!(load_dataset_benches);
