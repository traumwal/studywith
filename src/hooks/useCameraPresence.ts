import { useEffect, useState } from 'react';
import { CAMERA_DETECT_INTERVAL_MS, CAMERA_MIN_CONFIDENCE, CAMERA_SIZE } from '../constants';
import { blockMediapipeTelemetry } from '../lib/blockTelemetry';
import { observe, startTracker, type PresenceTracker } from '../lib/camera';

export type CameraStatus = 'off' | 'starting' | 'on' | 'error';

/**
 * カメラで「机の前にいるか」を判定する。
 * - 映像は自分のブラウザの中で顔検出にだけ使い、送信も保存もしない
 * - 320×240 で取得し、顔検出は 2 秒に 1 回（MediaPipe Face Detector の short-range モデル）
 * - MediaPipe はカメラをつけたときに初めて読み込む（使わない人には読み込ませない）
 * - MediaPipe の実行ファイルとモデルは自分のサイトから配り、利用統計の送信も止める（外部に何も送らない）
 */
export function useCameraPresence(enabled: boolean) {
  const [status, setStatus] = useState<CameraStatus>('off');
  const [error, setError] = useState('');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [tracker, setTracker] = useState<PresenceTracker | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      setTracker(null);
      return;
    }
    let cancelled = false;
    let interval = 0;
    let media: MediaStream | null = null;
    let detector: { close(): void } | null = null;
    setStatus('starting');
    setError('');

    (async () => {
      try {
        media = await navigator.mediaDevices.getUserMedia({
          video: { ...CAMERA_SIZE, facingMode: 'user', frameRate: { max: 15 } },
          audio: false,
        });
        if (cancelled) return;
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.srcObject = media;
        await video.play();

        // MediaPipe の利用統計の送信を止めてから読み込む
        blockMediapipeTelemetry();
        const { FilesetResolver, FaceDetector } = await import('@mediapipe/tasks-vision');
        const base = import.meta.env.BASE_URL;
        const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe`);
        const fd = await FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: `${base}models/blaze_face_short_range.tflite`, delegate: 'CPU' },
          runningMode: 'VIDEO',
          minDetectionConfidence: CAMERA_MIN_CONFIDENCE,
        });
        detector = fd;
        if (cancelled) return;

        let t = startTracker(Date.now());
        setTracker(t);
        setStream(media);
        setStatus('on');
        interval = window.setInterval(() => {
          if (video.readyState < 2) return;
          const faceSeen = fd.detectForVideo(video, performance.now()).detections.length > 0;
          t = observe(t, faceSeen, Date.now());
          setTracker(t);
        }, CAMERA_DETECT_INTERVAL_MS);
      } catch (e) {
        if (cancelled) return;
        console.warn('camera', e);
        const name = e instanceof DOMException ? e.name : '';
        setError(
          name === 'NotAllowedError'
            ? 'カメラの使用が許可されませんでした'
            : name === 'NotFoundError'
              ? 'カメラが見つかりませんでした'
              : 'カメラを使えませんでした',
        );
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(interval);
      media?.getTracks().forEach((track) => track.stop());
      detector?.close();
      setStream(null);
    };
  }, [enabled]);

  return {
    status,
    error,
    /** プレビュー用（画面に映すだけ） */
    stream,
    /** 机の前にいるか（カメラを使っていないときは true） */
    present: status !== 'on' || !tracker || tracker.present,
    /** 最後に顔が見えた時刻 */
    lastSeenAt: tracker?.lastSeenAt ?? null,
  };
}
