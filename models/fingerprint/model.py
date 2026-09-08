"""Fingerprint embedding backbone: ResNet50 + an upgraded projection head.

Moved out of `inference.py` into its own module - mirrors
`models/voice/model.py` vs. `models/voice/inference.py`'s split. Keeps
ResNet50's submodules **named** (`conv1`, `bn1`, `relu`, `maxpool`,
`layer1`..`layer4`, `avgpool`) instead of flattening them into an opaque
`nn.Sequential` (the previous approach), specifically so `train.py` can
freeze/fine-tune individual named layers rather than relying on a fragile
Sequential-index hack (`name.startswith('7')`, previously used to mean
"layer4", which breaks silently if torchvision ever reorders ResNet's
children).

This is a deliberate, intentional break from the old checkpoint format: the
old 256-dim `models/fingerprint/saved/fingerprint_embedder.pt` cannot load
into this architecture (different embedding dimension, different state_dict
key names) and must be retrained - see docs/DATASETS.md / the fingerprint
Kaggle kernel. `FingerprintEmbedder`'s *public* interface in `inference.py`
(`extract_embedding(image: np.ndarray)`) is unaffected, so nothing else in
the repo (`embeddings/pipelines.py`, `backend/services/fingerprint_service.py`,
`template_protection/`) needs to change.
"""

from __future__ import annotations

from models.fingerprint.config import FingerprintConfig


class FingerprintEmbeddingNet:
    """Thin wrapper so this module has no hard torch/torchvision import at module load time."""

    def __new__(cls, config: FingerprintConfig | None = None):
        import torch.nn as nn
        import torchvision.models as tv_models

        config = config or FingerprintConfig()

        class _Net(nn.Module):
            def __init__(self):
                super().__init__()
                backbone = tv_models.resnet50(weights=tv_models.ResNet50_Weights.IMAGENET1K_V2)
                # Kept as named attributes (not wrapped in nn.Sequential) so
                # freeze_backbone_layers() below can target them by name.
                self.conv1 = backbone.conv1
                self.bn1 = backbone.bn1
                self.relu = backbone.relu
                self.maxpool = backbone.maxpool
                self.layer1 = backbone.layer1
                self.layer2 = backbone.layer2
                self.layer3 = backbone.layer3
                self.layer4 = backbone.layer4
                self.avgpool = backbone.avgpool

                # Projection head (Part 5): 2048 -> 1024 -> BatchNorm -> ReLU
                # -> Dropout(0.3) -> 512-dim embedding, L2-normalized.
                self.projection = nn.Sequential(
                    nn.Linear(2048, 1024),
                    nn.BatchNorm1d(1024),
                    nn.ReLU(inplace=True),
                    nn.Dropout(0.3),
                    nn.Linear(1024, config.embedding_dim),
                )

            def forward(self, x):
                x = self.conv1(x)
                x = self.bn1(x)
                x = self.relu(x)
                x = self.maxpool(x)
                x = self.layer1(x)
                x = self.layer2(x)
                x = self.layer3(x)
                x = self.layer4(x)
                x = self.avgpool(x).flatten(1)
                embedding = self.projection(x)
                return nn.functional.normalize(embedding, dim=1)

        return _Net()


def freeze_backbone_layers(model, frozen_names: tuple[str, ...] = ("conv1", "bn1", "layer1")) -> None:
    """Set `requires_grad=False` on exactly the named submodules in `frozen_names`.

    Everything else on `model` (by default: `layer2`, `layer3`, `layer4`, and
    the projection head) keeps `requires_grad=True`, i.e. is fine-tuned. This
    is called once, right after constructing `FingerprintEmbeddingNet`, by
    `models/fingerprint/train.py`.
    """
    for name in frozen_names:
        submodule = getattr(model, name)
        for param in submodule.parameters():
            param.requires_grad = False
