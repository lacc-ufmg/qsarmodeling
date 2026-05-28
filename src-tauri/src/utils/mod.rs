pub mod stats;
use ndarray::{Array2, s};

pub fn select_columns(x: &Array2<f64>, cols: &[usize]) -> Array2<f64> {
    let n = x.nrows();
    let mut out = Array2::<f64>::zeros((n, cols.len()));
    for (new_j, &old_j) in cols.iter().enumerate() {
        out.column_mut(new_j).assign(&x.column(old_j));
    }
    out
}

/// Gauss-Jordan matrix inverse with partial column pivoting.
/// Returns `None` for (near-)singular matrices (|pivot| < 1 × 10⁻¹²).
pub fn mat_inv_gauss(a: Array2<f64>) -> Option<Array2<f64>> {
    let n = a.nrows();
    debug_assert_eq!(a.ncols(), n);

    // Build the augmented matrix [A | I_n].
    let mut aug = Array2::<f64>::zeros((n, 2 * n));
    aug.slice_mut(s![.., ..n]).assign(&a);
    for i in 0..n {
        aug[[i, n + i]] = 1.0;
    }

    for col in 0..n {
        // Partial pivoting: bring the largest |value| in this column to the diagonal.
        let pivot_row = (col..n)
            .max_by(|&r1, &r2| {
                aug[[r1, col]]
                    .abs()
                    .partial_cmp(&aug[[r2, col]].abs())
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .unwrap();

        if pivot_row != col {
            for j in 0..2 * n {
                let tmp            = aug[[col, j]];
                aug[[col, j]]      = aug[[pivot_row, j]];
                aug[[pivot_row, j]] = tmp;
            }
        }

        let pivot = aug[[col, col]];
        if pivot.abs() < 1e-12 {
            return None;
        }

        let inv_pivot = 1.0 / pivot;
        for j in 0..2 * n {
            aug[[col, j]] *= inv_pivot;
        }

        for row in 0..n {
            if row == col {
                continue;
            }
            let f = aug[[row, col]];
            if f.abs() < 1e-15 {
                continue;
            }
            for j in 0..2 * n {
                let d = aug[[col, j]] * f;
                aug[[row, j]] -= d;
            }
        }
    }

    Some(aug.slice(s![.., n..]).to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ndarray::{Array2};

    const EPS: f64 = 1e-9;

    // =========================================================================
    // mat_inv_gauss
    // =========================================================================

    #[test]
    fn mat_inv_inverts_1x1() {
        let a = Array2::from_shape_vec((1, 1), vec![4.0]).unwrap();
        let inv = mat_inv_gauss(a).unwrap();
        assert!((inv[[0, 0]] - 0.25).abs() < EPS);
    }

    #[test]
    fn mat_inv_inverts_2x2_diagonal() {
        // [[2, 0], [0, 5]]  →  [[0.5, 0], [0, 0.2]]
        let a = Array2::from_shape_vec((2, 2), vec![2.0, 0.0, 0.0, 5.0]).unwrap();
        let inv = mat_inv_gauss(a).unwrap();
        assert!((inv[[0, 0]] - 0.5).abs() < EPS);
        assert!((inv[[1, 1]] - 0.2).abs() < EPS);
        assert!(inv[[0, 1]].abs() < EPS);
        assert!(inv[[1, 0]].abs() < EPS);
    }

    #[test]
    fn mat_inv_inverts_2x2_dense() {
        // [[3, 1], [2, 4]]  →  1/10 · [[4, -1], [-2, 3]]
        let a = Array2::from_shape_vec((2, 2), vec![3.0, 1.0, 2.0, 4.0]).unwrap();
        let inv = mat_inv_gauss(a).unwrap();
        assert!((inv[[0, 0]] -  0.4).abs() < EPS);
        assert!((inv[[0, 1]] - -0.1).abs() < EPS);
        assert!((inv[[1, 0]] - -0.2).abs() < EPS);
        assert!((inv[[1, 1]] -  0.3).abs() < EPS);
    }

    #[test]
    fn mat_inv_product_with_original_is_identity() {
        // 3 × 3 non-trivial dense matrix
        let a = Array2::from_shape_vec(
            (3, 3),
            vec![1.0, 2.0, 0.0, 3.0, 4.0, 1.0, 0.0, 1.0, 2.0],
        )
        .unwrap();
        let inv = mat_inv_gauss(a.clone()).unwrap();
        let prod = a.dot(&inv);

        for i in 0..3 {
            for j in 0..3 {
                let expected = if i == j { 1.0 } else { 0.0 };
                assert!(
                    (prod[[i, j]] - expected).abs() < 1e-10,
                    "A·A⁻¹[{i},{j}] = {:.2e}, expected {expected}",
                    prod[[i, j]]
                );
            }
        }
    }

    #[test]
    fn mat_inv_returns_none_for_singular_matrix() {
        // rank-1 matrix: second row = 2 × first row
        let a = Array2::from_shape_vec((2, 2), vec![1.0, 2.0, 2.0, 4.0]).unwrap();
        assert!(mat_inv_gauss(a).is_none());
    }
}
