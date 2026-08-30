# Privacy & Security

This document tracks the project's privacy-preserving design and its honest
limitations. It will be substantially expanded in **Phase 2**, once the
cancelable transformation and key management are implemented. What follows is
the Phase 1 baseline: the principles this system commits to and how the
current codebase already upholds them, even before template protection
exists.

## Principles (see also `README.md` § Privacy Design)

1. **Raw biometric minimization.** Raw images exist only for the duration of
   a preprocessing/embedding call; nothing in `preprocessing/` or `models/`
   writes a raw image to disk. `.gitignore` blocks committing image files
   outright as a second line of defense.
2. **No unprotected embedding as a credential.** Once Phase 2 lands, the
   backend will only ever persist the output of
   `template_protection/cancelable_transform.py`, never a raw
   `BaseEmbedder.extract_embedding()` output.
3. **Key separation.** Transformation keys will be derived via HKDF from a
   server-side secret plus a user/application identifier — never stored
   plaintext next to the protected template they produced (Phase 2).
4. **Revocability & diversity.** Changing the transformation key must produce
   an unlinkable template for the same underlying biometric; the same
   biometric under different application keys must also be unlinkable
   (Phase 2 experiments 2 and 4).

## What Phase 1 does NOT yet claim

- There is **no cancelable/protected template yet** — `BaseEmbedder` output
  is a plain (if mock-mode, meaningless) embedding, not a production
  credential. Nothing in Phase 1 should be mistaken for the privacy layer
  itself; it is the recognition foundation that layer sits on top of.
- No claim of cryptographic security, "irreversibility," or regulatory
  compliance is made anywhere in this codebase, per the master project
  brief's explicit instruction not to overclaim. Phase 2 will state precisely
  what non-invertibility property the chosen transform does and does not
  provide, backed by the relevant literature.

## Threat/analysis topics deferred to Phase 2 (Experiment 5)

- Template leakage in a database-compromise scenario
- Replay-attack risk
- Transformation-key compromise
- Reconstruction risk (how much of the original embedding a protected
  template plausibly reveals)
- Cross-application linkability
