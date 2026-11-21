#!/bin/sh
# Generates the test clips the screenshot harness plays behind the lyrics (needs ffmpeg). Output is git-ignored.
cd "$(dirname "$0")/public" || exit 1
ffmpeg -loglevel error -y -f lavfi -i "mandelbrot=s=1280x720:rate=30:end_scale=0.01:start_scale=2:maxiter=400" -t 14 -vf "hue=h=t*25:s=1.6,eq=contrast=1.2:saturation=1.5" -pix_fmt yuv420p -c:v libx264 -preset veryfast -crf 30 night.mp4
ffmpeg -loglevel error -y -f lavfi -i "gradients=s=1280x720:rate=30:c0=0xffd27a:c1=0x6ad1ff:c2=0xffffff:c3=0xff8fb1:nb_colors=4:speed=0.02" -t 14 -pix_fmt yuv420p -c:v libx264 -preset veryfast -crf 26 day.mp4
