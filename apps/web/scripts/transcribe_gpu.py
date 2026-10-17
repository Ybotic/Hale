import json
import os
import sys
import tempfile

from faster_whisper import WhisperModel


def main():
    audio = sys.stdin.buffer.read()
    if not audio:
        raise ValueError("empty_audio")

    model_name = os.environ.get("HALE_WHISPER_MODEL", "large-v3")
    suffix = os.environ.get("HALE_AUDIO_SUFFIX", ".webm")
    with tempfile.NamedTemporaryFile(suffix=suffix) as source:
        source.write(audio)
        source.flush()
        model = WhisperModel(
            model_name,
            device="cuda",
            device_index=0,
            compute_type=os.environ.get("HALE_WHISPER_COMPUTE_TYPE", "float16"),
        )
        segments, _ = model.transcribe(
            source.name,
            beam_size=5,
            condition_on_previous_text=False,
        )
        transcript = [
            {"start": float(segment.start), "end": float(segment.end), "text": segment.text.strip()}
            for segment in segments
            if segment.text.strip() and segment.end > segment.start
        ]

    sys.stdout.write(json.dumps({"segments": transcript}, separators=(",", ":")))


if __name__ == "__main__":
    main()
