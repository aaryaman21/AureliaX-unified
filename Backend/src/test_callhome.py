import os
from pathlib import Path
from huggingface_hub import hf_hub_download
import pyarrow.parquet as pq

# Add src to path
import sys
src_dir = Path(__file__).resolve().parent
backend_dir = src_dir.parent
if str(src_dir) not in sys.path:
    sys.path.insert(0, str(src_dir))
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from voiceshield_inference import VoiceShieldModel
from multispeaker_detector import analyze_multispeaker_call


def extract_callhome_samples(target_dir: Path, count: int = 4):
    target_dir.mkdir(parents=True, exist_ok=True)
    print(f"[*] Downloading CALLHOME sample dataset from Hugging Face...")
    parquet_path = hf_hub_download(
        repo_id="prit1205/call_home_sample",
        filename="data/train-00000-of-00001-b942ab998f714c21.parquet",
        repo_type="dataset"
    )

    table = pq.read_table(parquet_path)
    rows = table.to_pylist()
    extracted_files = []

    for i, row in enumerate(rows[:count]):
        audio_data = row.get("audio", {})
        audio_bytes = audio_data.get("bytes")
        orig_name = audio_data.get("path") or f"callhome_sample_{i+1}.wav"
        filename = Path(orig_name).name
        if not filename.endswith(".wav"):
            filename = f"callhome_{i+1}.wav"
        out_file = target_dir / filename
        out_file.write_bytes(audio_bytes)
        extracted_files.append(out_file)
        print(f"    -> Extracted: {out_file.name} ({len(audio_bytes)} bytes)")

    return extracted_files


def run_evaluation(audio_files):
    print("\n" + "=" * 65)
    print(" CALLHOME TELEPHONE CONVERSATION EVALUATION")
    print("=" * 65)

    model = VoiceShieldModel()

    for idx, audio_file in enumerate(audio_files, 1):
        print(f"\n[Test {idx}/{len(audio_files)}] Audio File: {audio_file.name}")
        print("-" * 50)

        # 1. Single-Speaker Chunked Prediction
        try:
            single_result = model.predict_file(audio_file)
            print("  Single-Speaker Analysis:")
            print(f"    - Verdict:           {single_result.get('verdict')}")
            print(f"    - Synthetic Score:   {round(single_result.get('fake_score', 0) * 100, 2)}%")
            print(f"    - Real Score:        {round(single_result.get('real_score', 0) * 100, 2)}%")
            print(f"    - Confidence:        {round(single_result.get('confidence', 0) * 100, 2)}%")
        except Exception as e:
            print(f"    - Single-speaker error: {e}")

        # 2. Multi-Speaker Diarization + Turn-Taking Analysis
        try:
            multi_result = analyze_multispeaker_call(audio_file, model=model)
            print("  Multi-Speaker Diarization Analysis:")
            print(f"    - Analysis Mode:     {multi_result.get('analysis_type')}")
            print(f"    - Detected Speakers: {multi_result.get('detected_speakers')}")
            print(f"    - Overall Risk:      {multi_result.get('overall_risk_level')}")
            print(f"    - Overall Risk Score:{round(float(multi_result.get('overall_risk_score', 0)) * 100, 2)}%")
            if multi_result.get("dual_caller_summary"):
                print(f"    - Caller Summary:    {multi_result.get('dual_caller_summary')}")
            
            speakers = multi_result.get("speakers", [])
            for spk in speakers:
                lbl = spk.get("speaker_label", spk.get("speaker_id"))
                spk_risk = spk.get("risk_level")
                f_score = round(float(spk.get("fake_score", 0.0) or 0.0) * 100, 1)
                duration = spk.get("speech_duration", 0.0)
                print(f"      * {lbl}: {spk_risk} ({f_score}% fake score, {duration}s speech)")

        except Exception as e:
            print(f"    - Multi-speaker error: {e}")

    print("\n" + "=" * 65)
    print(f" Testing complete! Sample audio files saved to:")
    print(f" {audio_files[0].parent.resolve()}")
    print("=" * 65)


if __name__ == "__main__":
    out_dir = backend_dir / "dataset" / "callhome"
    files = extract_callhome_samples(out_dir, count=4)
    run_evaluation(files)
