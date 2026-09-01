# Computer Vision — Detailed Technical Reference

This document explains, in depth, every computer-vision technique used anywhere in this project: what it is, why it was chosen, exactly how it is implemented in this codebase (with file/line pointers), and what a reviewer would need to know to defend it in an evaluation. It is a companion to `PROJECT_REPORT.md`, which covers the project's motivation and status; this document is purely the "how does the vision pipeline actually work" reference.

For every modality, the pipeline has two stages, and it matters to be able to say precisely which stage is which:

1. **Preprocessing** (`preprocessing/`) — takes a raw image and produces a normalized, modality-specific representation. This stage is **entirely classical computer vision** — no learned weights, no neural network — for iris and fingerprint. Face preprocessing is the one exception, using a small pretrained detection network (MTCNN) for the classical CV task of "find and align the face region."
2. **Embedding** (`models/`) — takes the preprocessed representation and produces a fixed-length numeric vector (the "embedding") using a deep convolutional neural network, fine-tuned with metric learning. This stage **is** deep learning.

| Modality | Preprocessing (classical CV) | Embedding (deep learning) |
|---|---|---|
| Face | MTCNN detection + landmark-based geometric alignment | InceptionResnetV1 (512-d) |
| Iris | Hough Circle Transform localization + Daugman rubber-sheet normalization | ResNet18 + projection head (256-d) |
| Fingerprint | CLAHE contrast enhancement + statistical ridge normalization + Gabor filter bank enhancement | ResNet50 + projection head (256-d) |

---

## 1. Face: Detection, Alignment, and Embedding

**Code:** `preprocessing/face.py`, `models/face/inference.py`

### 1.1 Detection & alignment — MTCNN

MTCNN (Multi-task Cascaded Convolutional Networks; Zhang et al., 2016) is a three-stage cascade of small CNNs (P-Net → R-Net → O-Net) that progressively refines candidate face bounding boxes and produces five facial landmark points (eyes, nose, mouth corners) in a single pass. It is used here purely as the detection/localization front-end (`FacePreprocessor._get_detector` in `preprocessing/face.py`, via the `facenet-pytorch` package's `MTCNN` class), not as the identity-recognition model itself.

```python
detector = MTCNN(image_size=FACE_INPUT_SIZE, margin=0, post_process=True, device=self.device)
aligned = detector(pil_image)
```

The **alignment** step that follows detection — cropping and geometrically warping the detected face to a canonical 160×160 pose using the five landmark points — is classical geometric image processing (an affine transform derived from the landmark positions), handled internally by `facenet-pytorch`'s `MTCNN.__call__`. This is why the table above lists face preprocessing as "detection + alignment": detection is a small learned network, alignment given the detected landmarks is a deterministic geometric operation. The output is renormalized back to a standard `uint8` RGB array (`arr = ((arr * 128.0) + 127.5).clip(0, 255).astype(np.uint8)`) so the rest of the pipeline never has to know facenet-pytorch's internal tensor normalization convention.

**Why alignment matters at all:** a recognition network trained on canonically-posed faces performs substantially worse on faces at arbitrary rotation/scale/position — alignment removes that variance *before* the network has to learn to be invariant to it, which is both more accurate and requires less training data than expecting the embedding network to learn pose invariance itself.

### 1.2 Embedding — InceptionResnetV1

`models/face/inference.py` uses `InceptionResnetV1` (Szegedy et al.'s Inception architecture combined with residual connections, as adapted for face recognition and pretrained on VGGFace2 by the `facenet-pytorch` project) to map the aligned 160×160×3 face crop to a 512-dimensional embedding:

```python
tensor = (tensor - 127.5) / 128.0   # facenet-pytorch's expected input normalization
embedding = self._model(tensor)     # -> 512-d vector
```

The embedding is then L2-normalized by `BaseEmbedder.extract_embedding` (`models/common/base_embedder.py`), so that comparing two embeddings via cosine similarity is equivalent to comparing them via Euclidean distance — a standard convention in metric-learning-based recognition that keeps the comparison scale-invariant.

**Fine-tuning strategy:** rather than fine-tuning the entire network (expensive, and prone to catastrophic forgetting of the strong pretrained features), only the last Inception block plus the final linear/batch-norm layers are unfrozen:

```python
for name, param in backbone.named_parameters():
    param.requires_grad = any(name.startswith(p) for p in ['block8', 'last_linear', 'last_bn'])
```

This is a standard transfer-learning pattern: keep the low- and mid-level filters (edges, textures, local facial-part detectors) that VGGFace2 pretraining already learned well, and only adapt the highest-level, most task-specific layers to this project's specific enrolled identities.

---

## 2. Iris: Localization, Normalization, and Embedding

**Code:** `preprocessing/iris.py`, `models/iris/inference.py`

Iris recognition is the most classically-CV-heavy of the three pipelines — the entire preprocessing stage is deterministic image processing with **no learned weights at all**, following the standard iris-recognition pipeline established by John Daugman's foundational work (Daugman, *"How Iris Recognition Works"*, IEEE Transactions on Circuits and Systems for Video Technology, 2004).

### 2.1 Localization — Hough Circle Transform

The iris and the pupil are both approximately circular in a frontal eye image, at two different radii sharing (approximately) the same center. The Hough Circle Transform (`cv2.HoughCircles`, using the gradient-based `HOUGH_GRADIENT` method) detects circles in an image by having every edge pixel "vote" for the circle centers/radii it is consistent with, then finding the votes with the strongest accumulated support — it is one of the classic algorithms in the computer-vision curriculum, applied here to its textbook use case.

`IrisPreprocessor._locate_circles` (`preprocessing/iris.py`) runs this **twice** on a median-blurred, histogram-equalized grayscale image: once constrained to a small radius range to find the **pupil** boundary (the darker, smaller circle), then again constrained to a larger radius range — seeded from the pupil radius (`minRadius=int(pr * 1.8)`) — to find the **iris** boundary (the larger circle separating the colored iris from the white sclera):

```python
pupil_circles = cv2.HoughCircles(blurred, cv2.HOUGH_GRADIENT, dp=1,
                                  minDist=gray.shape[0] // 2, param1=100, param2=15,
                                  minRadius=gray.shape[0] // 12, maxRadius=gray.shape[0] // 4)
...
iris_circles = cv2.HoughCircles(blurred, cv2.HOUGH_GRADIENT, dp=1,
                                 minDist=gray.shape[0] // 2, param1=100, param2=15,
                                 minRadius=int(pr * 1.8), maxRadius=gray.shape[0] // 2)
```

`param1` is the higher Canny edge-detection threshold used internally by the Hough transform; `param2` is the accumulator threshold — how many votes a candidate circle needs before it's accepted. These values were tuned (and covered by an offline test, `tests/test_preprocessing.py`, using a synthetic eye image with clearly drawn concentric circles) to reliably find both boundaries without needing per-image manual parameter adjustment. If neither boundary can be found (e.g., an image with no circular structure at all), the function raises `ValueError` rather than silently returning garbage — this fail-loudly behavior is itself tested (`test_iris_preprocessing_raises_on_uninformative_image`).

### 2.2 Normalization — Daugman rubber-sheet model

Once the pupil circle `(px, py, pr)` and iris circle `(ix, iy, ir)` are known, the annular iris region between them is "unrolled" into a fixed-size rectangular strip. This is Daugman's **rubber-sheet model**: imagine the iris as a rubber sheet stretched between the two circle boundaries, and unroll it by sampling along rays from the pupil boundary to the iris boundary at every angle. Every pixel in the output strip corresponds to a `(radius, angle)` polar coordinate pair, remapped into Cartesian image coordinates:

```python
thetas = np.linspace(0, 2 * np.pi, self.strip_width, endpoint=False)      # angle axis
radii = np.linspace(0, 1, self.strip_height, endpoint=False)              # normalized radius axis

x_p, y_p = px + pr * cos_t, py + pr * sin_t   # pupil-boundary point at this angle
x_i, y_i = ix + ir * cos_t, iy + ir * sin_t   # iris-boundary point at this angle

x = x_p + r * (x_i - x_p)   # linear interpolation between the two boundaries, for r in [0, 1)
y = y_p + r * (y_i - y_p)
```

The output is a fixed `64 × 512` grayscale strip (`IRIS_STRIP_HEIGHT = 64`, `IRIS_STRIP_WIDTH = 512`), regardless of the original eye image's resolution or the person's pupil dilation at capture time — this is the entire point of the rubber-sheet transform: it makes the representation invariant to pupil dilation and to the iris's absolute size/position in the source image, so the embedding network downstream only ever has to learn from a consistent, normalized representation.

**Implementation note worth being able to discuss:** the first version of this function was a textbook-style nested Python `for` loop over every `(radius, angle)` pair — 64 × 512 = 32,768 iterations *per image*, in pure Python. This is fine for a handful of demo images but becomes a real bottleneck across a training dataset of thousands of images. It was rewritten to be fully vectorized with NumPy broadcasting — computing all `(H, W)` sample coordinates as arrays in one shot and using NumPy fancy indexing (`strip[valid] = gray[y[valid], x[valid]]`) instead of a Python-level loop — which is the same mathematical operation, verified to produce identical output (`tests/test_preprocessing.py`), just executed as vectorized array operations instead of scalar Python. This is a concrete example of a performance-motivated engineering decision made while actually running the pipeline against a real 20,000-image dataset, not a hypothetical concern (see `PROJECT_REPORT.md` §8.3).

### 2.3 Embedding — ResNet18 + projection head

`models/iris/inference.py` feeds the normalized strip (replicated to 3 channels, since the backbone expects the standard ImageNet 3-channel input) through an ImageNet-pretrained ResNet18 with the original 1000-class classification head removed, followed by a trainable linear projection to 256 dimensions:

```python
backbone = tv_models.resnet18(weights=tv_models.ResNet18_Weights.IMAGENET1K_V1)
self.backbone = nn.Sequential(*list(backbone.children())[:-1])  # drop the ImageNet FC head
self.projection = nn.Linear(512, IRIS_EMBEDDING_DIM)             # 512 -> 256
```

No pretrained iris-specific embedding model exists publicly, unlike face — so this is transfer learning from a *different domain* (natural images) rather than a related task, which is why only the last residual block (`layer4`) plus the projection head are unfrozen during fine-tuning, keeping the general-purpose low-level filters (edges, textures) intact and only adapting the highest-level features to iris-strip textures specifically.

---

## 3. Fingerprint: Enhancement and Embedding

**Code:** `preprocessing/fingerprint.py`, `models/fingerprint/inference.py`

Like iris, fingerprint preprocessing is entirely classical image processing — three sequential enhancement steps, each addressing a different source of noise in a raw fingerprint scan, before the deep-learning embedding stage.

### 3.1 CLAHE — Contrast Limited Adaptive Histogram Equalization

```python
self._clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
contrast_enhanced = self._clahe.apply(gray)
```

Standard (global) histogram equalization redistributes an image's whole intensity histogram to use the full dynamic range — but a fingerprint scan often has *locally* varying contrast (drier vs. oilier regions of the same finger, uneven scanner pressure), which a single global transform can't fix and can even over-amplify noise in already-low-contrast regions. CLAHE instead equalizes contrast **locally**, within small `8×8` tiles, and clips the contrast-amplification factor (`clipLimit=2.0`) to avoid over-amplifying noise in near-uniform tiles — this is the standard, textbook justification for using CLAHE over plain histogram equalization on scanner/sensor imagery specifically.

### 3.2 Statistical ridge normalization

```python
normalized = target_mean + np.sign(gray - mean) * np.sqrt(target_var * (gray - mean) ** 2 / var)
```

This rescales every pixel so the image has a fixed mean (`target_mean = 100.0`) and variance (`target_var = 100.0`), preserving the *sign* of each pixel's deviation from the original mean (i.e., ridges stay darker than valleys, valleys stay lighter than ridges) while standardizing the overall brightness/contrast level. This is the standard normalization step used before ridge-orientation-based fingerprint enhancement in the fingerprint-recognition literature (e.g., Hong, Wan & Jain's classic fingerprint enhancement pipeline), and it exists so that two scans of the same finger captured with different scanner pressure or sensor calibration are brought onto a comparable intensity scale before the next step.

### 3.3 Gabor filter bank enhancement

```python
for theta in np.arange(0, np.pi, np.pi / 8):     # 8 orientations, 0 to ~157.5 degrees
    kernel = cv2.getGaborKernel((15, 15), sigma=4.0, theta=theta, lambd=10.0, gamma=0.5, psi=0)
    filtered = cv2.filter2D(gray, cv2.CV_64F, kernel)
    enhanced = np.maximum(enhanced, filtered)
```

A Gabor filter is a sinusoidal plane wave modulated by a Gaussian envelope — it responds most strongly to texture oriented at a specific angle (`theta`) and a specific spatial frequency (`lambd`, the wavelength). Fingerprint ridges are locally near-parallel oriented texture, which is exactly what Gabor filters are the standard tool for enhancing in the fingerprint literature (this is the same principle behind the well-known Gabor-filter-bank fingerprint enhancement approach). The code applies a **bank** of 8 filters spanning orientations from 0° to ~157.5° in 22.5° steps, and takes the pixel-wise maximum response across all 8 orientations (`np.maximum(enhanced, filtered)`) — so at every pixel, the filter whose orientation best matches the local ridge direction dominates the output, sharpening ridge/valley contrast regardless of which direction the ridges happen to run in that region of the fingerprint (ridge orientation varies continuously across a real fingerprint, especially near the core and deltas).

The final enhanced image is resized to `224×224` (`FINGERPRINT_INPUT_SIZE`, matching the ResNet50 backbone's expected input) and replicated to 3 channels.

### 3.4 Embedding — ResNet50 + projection head

Structurally identical in approach to the iris embedder (`models/fingerprint/inference.py`): an ImageNet-pretrained ResNet50 with its classification head removed, followed by a projection to 256 dimensions, with only `layer4` and the projection head unfrozen during fine-tuning. ResNet50 (deeper/wider than the ResNet18 used for iris) was chosen here specifically as the DeepPrint substitute discussed in `PROJECT_REPORT.md` §7.1 — a larger capacity backbone was judged appropriate given fingerprint ridge patterns are a finer-grained texture than an iris strip.

---

## 4. Why Two Different "Classical CV Styles" Were Used (Face vs. Iris/Fingerprint)

A reviewer may reasonably ask why face preprocessing uses a *learned* detector (MTCNN) while iris and fingerprint preprocessing are *fully* classical. The answer is that the right tool depends on what's actually being detected:

- **Faces** appear at arbitrary position, scale, and rotation within an arbitrary photograph, against an arbitrary background — this is a genuinely hard, open-ended detection problem that decades of classical face-detection research (e.g. Viola-Jones cascades) never fully solved to modern accuracy standards, which is exactly why learned detectors like MTCNN superseded classical ones for this specific task.
- **Iris and fingerprint captures**, by contrast, come from purpose-built capture devices (an eye-close-up camera, a fingerprint scanner) that already constrain the subject to be roughly centered, at a known approximate scale, against a comparatively uncluttered background. Under those conditions, classical geometric techniques (Hough circles for a known-circular structure; contrast/frequency-domain enhancement for known-oriented ridge texture) are well-matched to the problem, computationally cheap, require no training data or GPU at inference time, and — crucially for a project whose entire premise is transparency and auditability (`PROJECT_REPORT.md` §5) — are fully deterministic and inspectable, unlike a learned detector's decision boundary.

This is a genuine engineering judgment call reflected in the code, not an inconsistency — and being able to explain *why* the two pipelines differ in this specific way is a stronger answer than either "we used deep learning everywhere" or "we used classical CV everywhere" would be.

---

## 5. The Shared Metric-Learning Approach: ArcFace

**Code:** `models/common/arcface.py`

All three modalities' fine-tuning uses the same loss function: **ArcFace** (Additive Angular Margin Loss; Deng, Guo, Xue & Zafeiriou, CVPR 2019). Understanding why a *specialized* loss is needed at all, rather than plain softmax cross-entropy, is important:

A network trained with plain softmax cross-entropy to classify *training* identities learns features that are separable enough to tell those specific training identities apart — but biometric verification needs something stronger: at *test* time, the system must compare two embeddings of people (or images) it has never necessarily seen labeled together before and decide "same person or different person" via a similarity threshold. That requires the embedding space itself to have **large angular margins between different identities and tight clustering within the same identity**, not just enough separability to pick the right softmax class during training.

ArcFace achieves this by adding an angular margin penalty `m` directly to the angle between an embedding and its true class's weight vector, inside the softmax:

```python
cosine = F.linear(F.normalize(embeddings), F.normalize(self.weight))   # cos(theta) between embedding and each class center
phi = cosine * self.cos_m - sine * self.sin_m                          # = cos(theta + m), the angular-margin-penalized version
phi = torch.where(cosine > self.threshold, phi, cosine - self.mm)      # numerical-stability guard, see below
...
output = (one_hot * phi + (1 - one_hot) * cosine) * self.s             # only the true class gets the margin penalty
```

In words: for the correct identity class, the model is penalized as if the angle between the embedding and that class's center were `m` radians (`m = 0.5`, roughly 28.6°) larger than it actually is, forcing the network to push same-identity embeddings *closer* together and different-identity embeddings *farther apart* than plain softmax would ever require, in order to still minimize the loss. The `s = 30.0` scale factor rescales the resulting cosine values before the softmax so gradients remain well-behaved (raw cosine similarities are confined to `[-1, 1]`, which produces a very "flat" softmax without rescaling). The `torch.where(cosine > self.threshold, ...)` guard exists because `cos(theta + m)` is not monotonic for angles near `pi`, so beyond a threshold angle the code falls back to a linear penalty (`cosine - self.mm`) instead — a standard numerical-stability fix described in the original ArcFace paper, not an ad-hoc addition.

**Why one shared loss across all three modalities matters for this project specifically:** it means the three training recipes are directly comparable to each other — when fingerprint's evaluation numbers came back much weaker than face's (`PROJECT_REPORT.md` §8.2), the difference could be attributed to data/capacity factors (class count, unfrozen-layer capacity) rather than "we used a fundamentally different, less effective training approach for that modality," which is a cleaner, more defensible position in an evaluation.

`ArcMarginProduct` is used **only during training** — at inference time (`models/*/inference.py`), only the backbone's raw embedding is used; the ArcFace head's class-center weights are training scaffolding, discarded once the checkpoint is saved.

---

## 6. Evaluation Methodology (shared across all three modalities)

**Code:** `evaluation/metrics.py`, `evaluation/roc.py`, `evaluation/experiments.py`

Every modality is evaluated identically, using standard biometric-verification metrics rather than plain classification accuracy, because **verification** (is this the same person as this enrolled template — a pairwise, open-set decision) is the actual deployed task, not **classification** (which of N known training identities is this).

- **Cosine similarity** (`evaluation/metrics.py: cosine_similarity`) — the comparison score between any two embeddings, consistent with the L2-normalization applied by `BaseEmbedder`.
- **Genuine / impostor pairs** (`evaluation/experiments.py: build_genuine_impostor_scores`) — every pair of test-set samples is scored; a pair from the *same* identity is a "genuine" pair (the score the system should recognize as a match), a pair from *different* identities is an "impostor" pair (the score the system should reject).
- **FAR / FRR at a threshold** (`compute_far_frr`) — the False Accept Rate is the fraction of impostor pairs that score *above* a chosen threshold (wrongly accepted); the False Reject Rate is the fraction of genuine pairs that score *below* it (wrongly rejected). These trade off against each other as the threshold moves — the entire reason multimodal fusion (`PROJECT_REPORT.md` §3) helps is that it can reduce both simultaneously, which single-modality threshold-tuning cannot.
- **Equal Error Rate (EER)** (`compute_eer`) — the threshold at which FAR and FRR are equal (or closest to equal, searched over all observed score values); this single number is the standard way the biometrics literature summarizes a system's overall discriminative power independent of any specific deployment's accept/reject policy.
- **ROC curve and AUC** (`evaluation/roc.py`, using `sklearn.metrics.roc_curve`/`auc`) — the full True-Positive-Rate-vs-False-Positive-Rate curve across every possible threshold, and the area under it (1.0 = perfect separation, 0.5 = random guessing) — the standard way to visualize and summarize verification performance independent of any single chosen threshold.

`run_modality_experiment` (`evaluation/experiments.py`) ties all of this together into the single function every training notebook calls after fine-tuning: it builds genuine/impostor scores from the held-out test split, finds the EER and its threshold, computes accuracy at that threshold, and computes the ROC/AUC — producing exactly the numbers reported in `PROJECT_REPORT.md` §8.2 for face and fingerprint. This same function is designed to be reused unchanged in Phase 2 (protected-vs-unprotected embedding comparison) and Phase 3 (every multimodal fusion combination), so the evaluation methodology stays identical throughout the project rather than being redefined per phase.
