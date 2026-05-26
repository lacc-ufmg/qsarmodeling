# `carbox` - example dataset

This directory contains two sets of 4D-QSAR descriptors generated for the same group of [Carboxamides](https://github.com/lacc-ufmg/datasets/tree/main/carboxamidas_HIV1-integrase) with different sampling densities.


- `X.csv` and `X_big.csv`: `;`-separated matrix (1 header row and 1 index column)
- `y.csv`: the activity (pIC50) values for each matching row of X (one value per row)

The dimensions are:

| File | Dimensions |
|---|---|
|`X.csv`|$49\times 12\,260$|
|`X_big.csv`|$49\times 34\,820$|
|`y.csv`|$49\times 1$|
