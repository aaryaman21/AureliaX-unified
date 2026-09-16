================================================================================
AURELIA-X / VOICESHIELD - LIVE DEMO & SHOWCASE AUDIO GUIDE
================================================================================

Use these pre-tested sample audio files to demonstrate the AI Deepfake Detection
system during presentations, demos, or hackathon judging.

--------------------------------------------------------------------------------
1. TO SHOWCASE AI DEEPFAKE DETECTION (RED ALERT / HIGH RISK)
--------------------------------------------------------------------------------
File: 1_DEMO_AI_HIGH_RISK_TRIGGER.wav
Length: ~1.3 seconds
Expected Model Result:
  * Verdict:          HIGH RISK (RED BANNER)
  * Synthetic Score:  68.54% Synthetic Probability
  * Confidence:       High Risk Flag Triggered
  * What to explain:  "When an audio with synthetic neural acoustic characteristics 
                      is provided, the WavLM temporal pooling pipeline detects anomalous 
                      phase coherence and spikes the risk score to 68.5%, triggering 
                      the High-Risk warning."

File: 4_DEMO_AI_TTS_CONVERSATION.wav
Length: ~4.0 seconds (Multi-speaker synthesized conversation)
Expected Model Result:
  * Peak Synthetic Score: 51.9% (Spikes above the suspicious threshold)
  * What to explain:  "Shows turn-by-turn multi-speaker chunk analysis across an AI-generated 
                      dialogue."

--------------------------------------------------------------------------------
2. TO SHOWCASE AUTHENTIC HUMAN SPEECH (GREEN / SAFE / NO FALSE ALARMS)
--------------------------------------------------------------------------------
File: 2_DEMO_AUTHENTIC_HUMAN_SAFE.wav
Length: ~3.0 seconds
Expected Model Result:
  * Verdict:          SAFE (GREEN)
  * Synthetic Score:  0.01% (99.99% Authenticity Confidence)
  * What to explain:  "Clean authentic human voice correctly identified as genuine 
                      with virtually 0% synthetic artifacts."

File: 3_DEMO_INDIAN_ENGLISH_HUMAN_SAFE.wav
Length: ~14.9 seconds (Spontaneous dialogue from MD3-EN Indian English dataset)
Expected Model Result:
  * Verdict:          SAFE (GREEN)
  * Synthetic Score:  0.16% (99.84% Authenticity Confidence)
  * What to explain:  "Demonstrates dialectal invariance. Fast-paced, natural Indian 
                      English conversation passes cleanly without triggering false alarms."

--------------------------------------------------------------------------------
HOW TO RUN THE DEMO:
1. Open the AureliaX Web UI in your browser: http://localhost:5173
2. Drag and drop any of the files above into the upload / call analysis area.
3. Compare the contrasting results:
   - 1_DEMO_AI_HIGH_RISK_TRIGGER.wav  ==> RED (HIGH RISK)
   - 2_DEMO_AUTHENTIC_HUMAN_SAFE.wav  ==> GREEN (SAFE)
================================================================================
