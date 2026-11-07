import { useEffect, useRef, useState } from 'react';
import { Modal } from './ui';

/** Camera barcode/QR scanning via the browser's BarcodeDetector (Chrome/Edge/Android). USB and Bluetooth scanners need no support: they "type" into the focused field. */
const FORMATS = ['qr_code', 'code_128', 'code_39', 'code_93', 'data_matrix', 'ean_13', 'ean_8', 'upc_a', 'itf', 'pdf417'];
export const canScan = () => typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;

function ScanDialog({ onResult, onClose }: { onResult: (v: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null); const [err, setErr] = useState('');
  useEffect(() => {
    let stream: MediaStream | null = null; let stop = false; let timer: number | undefined;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        const v = video.current!; v.srcObject = stream; await v.play();
        const det = new (window as any).BarcodeDetector({ formats: FORMATS });
        const tick = async () => {
          if (stop) return;
          try { const found = await det.detect(v); if (found[0]?.rawValue) { onResult(String(found[0].rawValue).trim()); return; } } catch { /* frame not ready */ }
          timer = window.setTimeout(tick, 200);
        };
        tick();
      } catch (e: any) { setErr(e?.name === 'NotAllowedError' ? 'Camera permission was denied.' : 'Could not start the camera.'); }
    })();
    return () => { stop = true; if (timer) clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); };
  }, [onResult]);
  return (
    <Modal title="Scan barcode / QR" onClose={onClose}>
      {err ? <div className="err">{err}</div> : <video ref={video} playsInline muted style={{ width: '100%', borderRadius: 10, background: '#000', maxHeight: '55vh' }} />}
      <div className="muted small">Point the camera at the code. A USB/Bluetooth barcode scanner also works — click the field and scan.</div>
    </Modal>
  );
}

export function ScanButton({ onScan, label = '📷 Scan' }: { onScan: (v: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!canScan()) return null;
  return (<>
    <button type="button" className="btn sm" onClick={() => setOpen(true)}>{label}</button>
    {open && <ScanDialog onClose={() => setOpen(false)} onResult={v => { setOpen(false); onScan(v); }} />}
  </>);
}
