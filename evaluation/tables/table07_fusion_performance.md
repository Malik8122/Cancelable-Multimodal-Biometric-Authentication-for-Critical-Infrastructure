# Fusion policies (chimeric virtual users from real data; mean ± SD over pairings)

| policy | modalities | FAR | FRR | accuracy | F1_pooled | TP/FN/FP/TN | protocol | source | evidence_label |
|---|---|---|---|---|---|---|---|---|---|
| face_only | face | 0.00% ± 0.01% | 79.86% ± 7.09% | 96.67% | 0.3351 | 290/1150/1/33119 | 20 chimeric pairings x 24 virtual users | evaluation/results/fusion_policy_metrics.csv (python -m evaluation.ieee.experiments) | REAL DATA |
| voice_only | voice | 0.13% ± 0.08% | 24.38% ± 2.04% | 98.86% | 0.8465 | 1089/351/44/33076 | 20 chimeric pairings x 24 virtual users | evaluation/results/fusion_policy_metrics.csv (python -m evaluation.ieee.experiments) | REAL DATA |
| fingerprint_only | fingerprint | 15.42% ± 3.58% | 5.76% ± 1.58% | 84.98% | 0.3434 | 1357/83/5107/28013 | 20 chimeric pairings x 24 virtual users | evaluation/results/fusion_policy_metrics.csv (python -m evaluation.ieee.experiments) | REAL DATA |
| ALL_REQUIRED(face+voice) | face+voice | 0.00% ± 0.00% | 84.86% ± 6.06% | 96.46% | 0.2630 | 218/1222/0/33120 | 20 chimeric pairings x 24 virtual users | evaluation/results/fusion_policy_metrics.csv (python -m evaluation.ieee.experiments) | REAL DATA |
| WEIGHTED(face+voice) | face+voice | 0.00% ± 0.00% | 59.24% ± 5.63% | 97.53% | 0.5792 | 587/853/0/33120 | 20 chimeric pairings x 24 virtual users | evaluation/results/fusion_policy_metrics.csv (python -m evaluation.ieee.experiments) | REAL DATA |
| OR(face+voice) | face+voice | 0.14% ± 0.08% | 19.38% ± 3.50% | 99.06% | 0.8776 | 1161/279/45/33075 | 20 chimeric pairings x 24 virtual users | evaluation/results/fusion_policy_metrics.csv (python -m evaluation.ieee.experiments) | REAL DATA |
| MAJORITY(face+voice)=AND | face+voice | 0.00% ± 0.00% | 84.86% ± 6.06% | 96.46% | 0.2630 | 218/1222/0/33120 | 20 chimeric pairings x 24 virtual users | evaluation/results/fusion_policy_metrics.csv (python -m evaluation.ieee.experiments) | REAL DATA |
| ALL_REQUIRED(3) | face+voice+fingerprint | 0.00% ± 0.00% | 85.69% ± 5.89% | 96.43% | 0.2503 | 206/1234/0/33120 | 20 chimeric pairings x 24 virtual users | evaluation/results/fusion_policy_metrics.csv (python -m evaluation.ieee.experiments) | REAL DATA |
| WEIGHTED(3) | face+voice+fingerprint | 0.00% ± 0.00% | 51.53% ± 5.27% | 97.85% | 0.6529 | 698/742/0/33120 | 20 chimeric pairings x 24 virtual users | evaluation/results/fusion_policy_metrics.csv (python -m evaluation.ieee.experiments) | REAL DATA |
| AT_LEAST_TWO(3)=MAJORITY | face+voice+fingerprint | 0.02% ± 0.05% | 22.85% ± 3.99% | 99.02% | 0.8683 | 1111/329/8/33112 | 20 chimeric pairings x 24 virtual users | evaluation/results/fusion_policy_metrics.csv (python -m evaluation.ieee.experiments) | REAL DATA |
| OR(3) | face+voice+fingerprint | 15.53% ± 3.56% | 1.46% ± 1.39% | 85.06% | 0.3546 | 1419/21/5144/27976 | 20 chimeric pairings x 24 virtual users | evaluation/results/fusion_policy_metrics.csv (python -m evaluation.ieee.experiments) | REAL DATA |
