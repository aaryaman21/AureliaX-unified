# Regularization experiment

This is an experimental artifact, not a verified fix or the default model.

Training used 2,000 cached embeddings (originals plus augmentation) from the
existing training split. Selection used the 200-file validation split only.
No test_audio files, custom recordings, or testing-split files were used in
training or selection. Byte-identical training/validation overlap was checked;
speaker-disjointness is not established by this check.

Five regularization strengths were compared. C=0.1 was selected by the rule in
selection_report.json, retaining 6/100 human false positives and 2/100 missed
fakes with improved validation log loss. This is not an improvement in validation
classification accuracy. Thresholds were unchanged.

After selection and saving the candidate, human_test.wav was evaluated once.
It still received FAKE, with a fake score rounded to 99.99%. The candidate does
not resolve the reported false positive. This result was not used to revise
the candidate. No other test_audio files were evaluated in this experiment.

These classifier scores are not established probabilities of authenticity on
new microphones, speakers, languages, or synthesis systems. Further work needs
separate, consented, labeled development audio representative of deployment and
an independent evaluation set. Keep the user's test recordings out of training.
