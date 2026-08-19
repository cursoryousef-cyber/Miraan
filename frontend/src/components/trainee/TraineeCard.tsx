import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { IdCard, RotateCw } from 'lucide-react';
import { apiClient } from '../../api/client';
import { colour, font, radius, space } from '../../components/ui';

interface TraineeCardProps {
  profile: any;
  rotation: any;
}

/**
 * Digital intern ID card. The QR encodes only a signed, opaque verification
 * token (GET /trainees/card/qr-token) — never the national ID or any other
 * sensitive field — and a scanner resolves it server-side via the public
 * /trainees/card/verify endpoint, which itself returns only the minimal
 * public-facing fields.
 */
export const TraineeCard: React.FC<TraineeCardProps> = ({ profile, rotation }) => {
  const [flipped, setFlipped] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get('/trainees/card/qr-token')
      .then(async (res) => {
        const token = res.data?.data?.token;
        if (!token) return;
        const url = await QRCode.toDataURL(token, { margin: 1, width: 220 });
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setError('لم يتم إصدار بطاقة لهذا المتدرب بعد');
      });
    return () => { cancelled = true; };
  }, []);

  const cardStatusLabel = profile?.cardStatus === 'active' ? 'سارية' : profile?.cardStatus === 'revoked' ? 'ملغاة' : 'غير مفعّلة';

  return (
    <div style={{ perspective: 1200, maxWidth: 420, width: '100%' }}>
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '1.586',
          transformStyle: 'preserve-3d',
          transition: 'transform 0.6s cubic-bezier(0.4, 0.2, 0.2, 1)',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Front */}
        <div
          style={{
            position: 'absolute', inset: 0, backfaceVisibility: 'hidden',
            borderRadius: radius.lg, background: `linear-gradient(135deg, ${colour.primary}, #0b544e)`,
            color: '#fff', padding: space.xl, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            boxShadow: '0 12px 32px rgba(15,118,110,0.28)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: font.label, opacity: 0.8, fontWeight: 700, letterSpacing: 0.5 }}>بطاقة طالب امتياز</div>
              <div style={{ fontSize: font.sectionTitle, fontWeight: 800, marginTop: 4 }}>{profile?.person?.nameAr ?? '—'}</div>
            </div>
            <IdCard size={28} opacity={0.85} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: space.md, fontSize: font.caption }}>
            <div><div style={{ opacity: 0.7 }}>الرقم الأكاديمي</div><div style={{ fontWeight: 700 }}>{profile?.traineeNumber ?? '—'}</div></div>
            <div><div style={{ opacity: 0.7 }}>التخصص</div><div style={{ fontWeight: 700 }}>{profile?.program?.nameAr ?? '—'}</div></div>
            <div><div style={{ opacity: 0.7 }}>المستشفى</div><div style={{ fontWeight: 700 }}>{profile?.organization?.nameAr ?? '—'}</div></div>
            <div><div style={{ opacity: 0.7 }}>القسم</div><div style={{ fontWeight: 700 }}>{rotation?.department?.nameAr ?? '—'}</div></div>
            <div><div style={{ opacity: 0.7 }}>المدرب</div><div style={{ fontWeight: 700 }}>{rotation?.trainerProfile?.person?.nameAr ?? '—'}</div></div>
            <div><div style={{ opacity: 0.7 }}>حالة التدريب</div><div style={{ fontWeight: 700 }}>{profile?.applicationStatus === 'active' ? 'نشط' : profile?.applicationStatus ?? '—'}</div></div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: font.caption, opacity: 0.75 }}>
              {rotation ? `${String(rotation.startDate).slice(0, 10)} → ${String(rotation.endDate).slice(0, 10)}` : 'لا يوجد روتيشن نشط'}
            </div>
            <button
              onClick={() => setFlipped(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: radius.sm,
                padding: '6px 12px', fontSize: font.caption, fontWeight: 700, cursor: 'pointer',
              }}
            >
              <RotateCw size={14} /> قلب البطاقة
            </button>
          </div>
        </div>

        {/* Back */}
        <div
          style={{
            position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)',
            borderRadius: radius.lg, background: colour.surface, border: `1px solid ${colour.border}`,
            padding: space.xl, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: space.sm, boxShadow: '0 12px 32px rgba(15,23,42,0.12)',
          }}
        >
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR Code" width={140} height={140} style={{ borderRadius: radius.sm }} />
          ) : error ? (
            <div style={{ fontSize: font.body, color: colour.muted, textAlign: 'center' }}>{error}</div>
          ) : (
            <div style={{ fontSize: font.body, color: colour.muted }}>جارٍ إصدار الرمز…</div>
          )}
          <div style={{ fontSize: font.caption, color: colour.muted, fontWeight: 700 }}>رقم البطاقة: {profile?.cardUuid ?? '—'}</div>
          <div style={{ fontSize: font.caption, color: colour.muted }}>الحالة: {cardStatusLabel}</div>
          <div style={{ fontSize: font.caption, color: colour.faint, textAlign: 'center', maxWidth: 240 }}>
            امسح للتحقق من بطاقة طالب الامتياز
          </div>
          <button
            onClick={() => setFlipped(false)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, background: colour.subtle,
              border: `1px solid ${colour.border}`, color: colour.text, borderRadius: radius.sm,
              padding: '6px 12px', fontSize: font.caption, fontWeight: 700, cursor: 'pointer', marginTop: space.sm,
            }}
          >
            <RotateCw size={14} /> الوجه الأمامي
          </button>
        </div>
      </div>
    </div>
  );
};

export default TraineeCard;
