import React, { useState } from 'react';
import { DataPageShell, Panel, Surface } from '../components/ui';
import { colour, font, radius, space } from '../components/ui/tokens';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { Wand2, CheckCircle2, Building2, User, ShieldCheck, Copy } from 'lucide-react';
import { Button, TextField, Stepper, Step, StepLabel, Alert, LinearProgress } from '@mui/material';

export const OrganizationWizard: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const [resultData, setResultData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    organizationTypeId: '',
    parentId: '',
    code: '',
    nameAr: '',
    nameEn: '',
    cityAr: 'عرعر',
    regionAr: 'الحدود الشمالية',
    contactEmail: '',
    adminNameAr: '',
    adminEmail: '',
    adminNationalId: '',
    adminPhone: '',
  });

  // Fetch Org Types & Existing Parent Orgs
  const { isLoading: isLoadingOrgTypes, isError: isErrorOrgTypes } = useQuery({
    queryKey: ['orgTypes'],
    queryFn: async () => {
      const res = await apiClient.get('/organizations');
      return res.data;
    },
  });

  const steps = ['بيانات الجهة الأساسية', 'النوع والهيكل التنظيمي', 'الحساب الإداري التلقائي', 'التراخيص والإعدادات', 'الإنهاء ورابط التفعيل'];

  const handleNext = async () => {
    if (activeStep === 3) {
      setError(null);
      try {
        const res = await apiClient.post('/organizations/provision-wizard', {
          organization: {
            organizationTypeId: formData.organizationTypeId || '90176846-9cf7-4e31-9257-2c976d8b9415',
            parentId: formData.parentId || undefined,
            code: formData.code,
            nameAr: formData.nameAr,
            nameEn: formData.nameEn,
            cityAr: formData.cityAr,
            regionAr: formData.regionAr,
            contactEmail: formData.contactEmail || formData.adminEmail,
          },
          adminNameAr: formData.adminNameAr,
          adminEmail: formData.adminEmail,
          adminNationalId: formData.adminNationalId,
          adminPhone: formData.adminPhone,
        });

        setResultData(res.data);
        setActiveStep(4);
      } catch (err: any) {
        setError(err.response?.data?.message || 'حدث خطأ أثناء معالجة تزويد الجهة الآلي');
      }
    } else {
      setActiveStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DataPageShell
      eyebrow="ORGANISATION PROVISIONING"
      icon={Wand2}
      title="معالج تزويد الجهات"
      subtitle="إنشاء الجهة وتزويدها بالتراخيص والحسابات الإدارية والهيكل التنظيمي عبر خطوات موجّهة"
      stats={[
        { label: 'خطوة العمل الحالية', value: `${activeStep + 1} / 5`, icon: Wand2, tone: 'primary' },
        { label: 'الترخيص الافتراضي', value: 'Enterprise (1 YR)', icon: ShieldCheck, tone: 'success' },
      ]}
    >
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: space.xl, width: '100%' }}>
        {isLoadingOrgTypes && <LinearProgress sx={{ borderRadius: 1 }} />}
        {isErrorOrgTypes && <Alert severity="error">تعذر تحميل أنواع الجهات من الخادم</Alert>}

        {/* Stepper */}
        <Stepper activeStep={activeStep} alternativeLabel style={{ backgroundColor: 'transparent' }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel sx={{ '& .MuiStepLabel-label': { color: colour.text, fontWeight: 700, fontSize: font.caption } }}>
                {label}
              </StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && <Alert severity="error">{error}</Alert>}

        {/* Form Panel */}
        <Panel title={steps[activeStep]} icon={Building2} tone="primary">
          {activeStep === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
              <TextField
                label="اسم الجهة بالعربية"
                value={formData.nameAr}
                onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                placeholder="مثال: مستشفى عرعر المركزي الجديد"
                fullWidth
                required
              />
              <TextField
                label="اسم الجهة بالإنجليزية"
                value={formData.nameEn}
                onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                placeholder="e.g. New Arar Central Hospital"
                fullWidth
                required
              />
              <TextField
                label="رمز الجهة الفريد (Unique Code)"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="مثال: HOSP-NACH-01"
                fullWidth
                required
              />
            </div>
          )}

          {activeStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
              <TextField
                label="المدينة والمنطقة"
                value={formData.cityAr}
                onChange={(e) => setFormData({ ...formData, cityAr: e.target.value })}
                fullWidth
              />
              <p style={{ fontSize: font.caption, color: colour.muted, margin: 0 }}>
                سيتم إنشاء السجل في الشجرة التنظيمية (Closure Table) وتعيين المسارات تلقائياً بدون تداخل.
              </p>
            </div>
          )}

          {activeStep === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: space.lg }}>
              <TextField
                label="اسم المدير بالعربية"
                value={formData.adminNameAr}
                onChange={(e) => setFormData({ ...formData, adminNameAr: e.target.value })}
                placeholder="د. أحمد عبدالله العنزي"
                fullWidth
                required
              />
              <TextField
                label="البريد الإلكتروني للمدير (سيصل رابط التفعيل عليه)"
                value={formData.adminEmail}
                onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                placeholder="admin@hospital.health.sa"
                type="email"
                fullWidth
                required
              />
              <TextField
                label="الهوية الوطنية / الإقامة"
                value={formData.adminNationalId}
                onChange={(e) => setFormData({ ...formData, adminNationalId: e.target.value })}
                fullWidth
              />
            </div>
          )}

          {activeStep === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: space.md }}>
              <div style={{
                backgroundColor: colour.primarySoft, padding: space.lg,
                borderRadius: radius.md, border: `1px solid ${colour.primary}`,
              }}>
                <div style={{ fontSize: font.body, fontWeight: 700, color: colour.primary }}>
                  باقة التشغيل: Enterprise License (1 Year)
                </div>
                <div style={{ fontSize: font.caption, color: colour.muted, marginTop: space.xs }}>
                  تتضمن: 100 مستخدم إداري + 500 متدرب + 50 GB مساحة تخزينية + كافّة ميزات النظام والمستندات والنداءات.
                </div>
              </div>
            </div>
          )}

          {activeStep === 4 && resultData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: space.xl, textAlign: 'center' }}>
              <CheckCircle2 size={64} color={colour.primary} style={{ margin: '0 auto' }} />
              <h2 style={{ fontSize: font.sectionTitle, fontWeight: 800, color: colour.text, margin: 0 }}>
                تم إنشاء الجهة والحساب الإداري بنجاح!
              </h2>

              <Surface padding={space.lg}>
                <div style={{ fontSize: font.caption, color: colour.muted, textAlign: 'right' }}>رابط تفعيل الحساب الصادر لمدير الجهة:</div>
                <div style={{ display: 'flex', gap: space.md, marginTop: space.sm, alignItems: 'center' }}>
                  <TextField
                    value={resultData.activationLink}
                    fullWidth
                    size="small"
                    InputProps={{ readOnly: true }}
                  />
                  <Button
                    variant="outlined"
                    onClick={() => copyToClipboard(resultData.activationLink)}
                    startIcon={<Copy size={16} />}
                    sx={{ borderColor: colour.primary, color: colour.primary, fontWeight: 700 }}
                  >
                    {copied ? 'تم النسخ' : 'نسخ'}
                  </Button>
                </div>
              </Surface>
            </div>
          )}

          {/* Buttons Nav */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: space.xl }}>
            {activeStep < 4 && (
              <Button disabled={activeStep === 0} onClick={handleBack} sx={{ color: colour.muted, fontWeight: 700 }}>
                السابق
              </Button>
            )}

            {activeStep < 4 && (
              <Button
                variant="contained"
                onClick={handleNext}
                sx={{ background: colour.primary, fontWeight: 700, marginRight: 'auto', borderRadius: 2 }}
              >
                {activeStep === 3 ? 'إنشاء وتزويد الجهة الآن' : 'التالي'}
              </Button>
            )}
          </div>
        </Panel>
      </div>
    </DataPageShell>
  );
};

export default OrganizationWizard;

