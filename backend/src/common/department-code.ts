/**
 * Department codes differ per hospital for the same clinical unit
 * ('ER' vs 'EMERGENCY', 'INT-MED' vs 'INTERNAL_MED', tower prefixes like 'NT-'),
 * while training plan templates are national. Both the allocation engine and
 * plan instantiation match on this canonical form, so a hospital the engine
 * accepted is a hospital instantiation can actually place rotations in.
 */
const DEPARTMENT_ALIASES: Record<string, string> = {
  ER: 'EMERGENCY', EMERGENCY: 'EMERGENCY', ACCIDENTEMERGENCY: 'EMERGENCY',
  INTMED: 'INTERNAL_MED', INTERNALMED: 'INTERNAL_MED', INTERNALMEDICINE: 'INTERNAL_MED',
  SURGERY: 'SURGERY', GENERALSURGERY: 'SURGERY',
  PED: 'PEDIATRICS', PEDS: 'PEDIATRICS', PEDMED: 'PEDIATRICS', PEDIATRICS: 'PEDIATRICS',
  OBGYN: 'OBGYN', OBSGYN: 'OBGYN',
  ICU: 'ICU', CRITICALCARE: 'ICU',
  OR: 'OR', OPERATINGROOM: 'OR',
  LAB: 'LAB', LABORATORY: 'LAB',
  RADIOLOGY: 'RADIOLOGY', XRAY: 'RADIOLOGY',
  PHARMACY: 'PHARMACY',
};

/** Strips punctuation and hospital/tower prefixes, then maps through the alias table. */
export function canonicalDepartmentCode(code: string | null | undefined): string {
  if (!code) return '';
  let normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Tower/building prefixes ('NT-ER' → 'ER') carry no clinical meaning.
  normalized = normalized.replace(/^(NT|ST|WT|ET|B\d)/, '') || normalized;
  return DEPARTMENT_ALIASES[normalized] ?? normalized;
}

/**
 * Whether a hospital department satisfies a template rotation, by code first and
 * then by Arabic name — the same two-step used when instantiating a plan.
 */
export function departmentMatchesTemplate(
  dept: { code: string | null; nameAr: string },
  tpl: { departmentCode: string; departmentNameAr: string },
): boolean {
  if (canonicalDepartmentCode(dept.code) === canonicalDepartmentCode(tpl.departmentCode)) {
    return true;
  }
  const needle = tpl.departmentNameAr.replace(/^قسم\s+/, '').trim();
  const deptName = dept.nameAr.replace(/^قسم\s+/, '').trim();
  return dept.nameAr.includes(needle) || (needle.length > 3 && needle.includes(deptName));
}
