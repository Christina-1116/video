#!/usr/bin/env bash
# Break down a reference video: shot cuts, keyframes, contact sheet, audio/subtitle info.
# Usage: bash analyze_reference.sh reference.mp4 [out_dir] [scene_threshold=0.25]
# Output: out_dir/{info.txt, cuts.txt, shots/shot-XXX.jpg, contact.jpg, every2s/*.jpg, audio.wav}
set -euo pipefail
IN="$1"; OUT="${2:-$(basename "${IN%.*}")-breakdown}"; TH="${3:-0.25}"
mkdir -p "$OUT/shots" "$OUT/every2s"

ffprobe -v error -show_entries format=duration,bit_rate:stream=codec_type,codec_name,width,height,r_frame_rate,channels,sample_rate \
  -of default=nw=1 "$IN" > "$OUT/info.txt"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")

# 1) shot boundaries (scene-change score) -> cuts.txt (seconds)
ffmpeg -v error -i "$IN" -vf "select='gt(scene,$TH)',showinfo" -f null - 2>&1 \
  | grep -o 'pts_time:[0-9.]*' | cut -d: -f2 > "$OUT/cuts.txt" || true
echo "0" | cat - "$OUT/cuts.txt" > "$OUT/starts.txt"

# 2) one keyframe from the middle of every shot
i=0; prev=""
while read -r s; do
  if [ -n "$prev" ]; then
    mid=$(python3 -c "print(($prev+$s)/2)")
    ffmpeg -v error -y -ss "$mid" -i "$IN" -frames:v 1 -vf scale=640:-2 "$OUT/shots/shot-$(printf %03d $i).jpg"; i=$((i+1))
  fi; prev="$s"
done < <(cat "$OUT/starts.txt"; echo "$DUR")

# 3) uniform sampling every 2 s (motion / camera analysis) + contact sheet
ffmpeg -v error -y -i "$IN" -vf "fps=1/2,scale=480:-2" "$OUT/every2s/f-%03d.jpg"
ffmpeg -v error -y -i "$IN" -vf "fps=1/2,scale=384:-2,tile=6x$(( ( ${DUR%.*} / 2 + 5 ) / 6 + 1 ))" -frames:v 1 "$OUT/contact.jpg" || true

# 4) audio track for transcription (whisper etc.) if present
if grep -q codec_type=audio "$OUT/info.txt"; then ffmpeg -v error -y -i "$IN" -vn -ac 1 -ar 16000 "$OUT/audio.wav"; fi
# 5) embedded subtitles if any
ffmpeg -v error -y -i "$IN" -map 0:s:0 "$OUT/subs.srt" 2>/dev/null || rm -f "$OUT/subs.srt"

echo "shots: $(ls "$OUT/shots" | wc -l)   duration: ${DUR}s   -> $OUT"
echo "Next: view contact.jpg + shots/*.jpg and fill references/style-breakdown.md's checklist for this video."
