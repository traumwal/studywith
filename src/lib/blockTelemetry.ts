/**
 * MediaPipe は、使った回数などの利用統計を 1 分ごとに Google のサーバーへ送る（映像ではない）。
 * 止める設定が無いので、その宛先への fetch だけを送る前に止める。
 * 失敗の応答を返すと MediaPipe 側は送るのをやめる。映像も統計も、この端末の外には出ない。
 */
const BLOCKED = 'https://odml.pa.googleapis.com/';
let installed = false;

export function blockMediapipeTelemetry() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(BLOCKED)) return Promise.resolve(new Response(null, { status: 403, statusText: 'blocked' }));
    return original(input, init);
  };
}
