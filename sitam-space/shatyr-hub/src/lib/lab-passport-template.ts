// The official SITAM Lab Passport (Зертхана паспорты) template of the dean's office, as used in the 2026 passports.
// The document is stored as one JSON object in lab_passports.doc (v30). Labels exist in Kazakh (kk) and English (en).
import { HEAD_ROLES, type Lab } from '@/lib/api';

export type PassportLang = 'kk' | 'en';
export type PassportTable = { columns: string[]; rows: string[][] };
export type TableKey = 'equipment' | 'equipment_extra' | 'software' | 'staff' | 'courses' | 'students' | 'specs' | 'projects';
export type GeneralKey = 'name' | 'department' | 'year' | 'area' | 'location' | 'science_head' | 'head' | 'specialization';
export type PassportDoc = {
  v: 1;
  lang: PassportLang;
  /** lines of the "БЕКІТЕМІН / APPROVED" block (title of the dean and the name) */
  approver: string[];
  header_note?: string[];
  general: Partial<Record<GeneralKey | 'type', string>>;
  tables: Partial<Record<TableKey, PassportTable>>;
  plan_image?: string;
  plan_note?: string;
  outcomes?: string;
  prepared: { role?: string; name?: string };
  agreed: { role?: string; name?: string };
  source?: string;
};

type L = Record<PassportLang, string>;
export const T = {
  approve: { kk: 'БЕКІТЕМІН', en: 'APPROVED' } as L,
  date: { kk: '«______»__________________ 2026 ж.', en: '“____” ______________ 2026' } as L,
  title: { kk: 'ЗЕРТХАНА ПАСПОРТЫ', en: 'LABORATORY PASSPORT' } as L,
  s1: { kk: 'ЖАЛПЫ АҚПАРАТ', en: 'GENERAL INFORMATION' } as L,
  s2: { kk: 'ЗЕРТХАНАНЫҢ БІЛІМ САЛАСЫ', en: 'FIELD OF EDUCATION OF THE LABORATORY' } as L,
  s3: { kk: 'ЗЕРТХАНАНЫҢ ТЕХНИКАЛЫҚ ПАСПОРТЫ', en: 'TECHNICAL PASSPORT OF THE LABORATORY' } as L,
  s4: { kk: 'ҒЫЛЫМИ ЖОБАЛАР ЖӘНЕ НӘТИЖЕЛЕР', en: 'RESEARCH PROJECTS AND OUTCOMES' } as L,
  plan: { kk: 'Бөлімшенің және ішіндегі жабдықтардың орналасуының жоспар сызбасы', en: 'Plan of the sub-division and the location of the equipment inside' } as L,
  outcomes: { kk: 'Студенттерді тарту мен нәтижелер', en: 'Student involvement and outcomes' } as L,
  prepared: { kk: 'ӘЗІРЛЕГЕН:', en: 'DEVELOPED BY:' } as L,
  agreed: { kk: 'КЕЛІСІЛДІ:', en: 'AGREED BY:' } as L,
  sign: { kk: 'қолы', en: 'signature' } as L,
  no: { kk: '№', en: 'No.' } as L,
};

export const GENERAL_FIELDS: { key: GeneralKey; label: L; rows: number }[] = [
  { key: 'name', label: { kk: 'Оқу-зертханалық зертханалардың жалпы атауы', en: 'The general name of the educational laboratories is' }, rows: 1 },
  { key: 'department', label: { kk: 'Базалық бөлімше (кафедра)', en: 'School' }, rows: 1 },
  { key: 'year', label: { kk: 'Зертхананың құрылған жылы', en: 'Year of establishment of the Laboratory' }, rows: 1 },
  { key: 'area', label: { kk: 'Зертхананың жалпы аумағы', en: 'Total area of the Laboratory' }, rows: 1 },
  { key: 'location', label: { kk: 'Зертхананың орналасқан жері', en: 'Location of the Laboratory' }, rows: 1 },
  { key: 'science_head', label: { kk: 'Зертхананың ғылыми жетекшісі', en: 'Scientific head of the Laboratory' }, rows: 2 },
  { key: 'head', label: { kk: 'Зертхананың жетекшісі (меңгеруші)', en: 'Head of the Laboratory (Head)' }, rows: 2 },
  { key: 'specialization', label: { kk: 'Зертхананың мамандандырылуы (тағайыны, жұмыс істеу мақсаты)', en: 'Specialization of the Laboratory (assignment, purpose of work)' }, rows: 6 },
];

export const TABLES: { key: TableKey; section: 1 | 2 | 3 | 4; label: L; columns: Record<PassportLang, string[]> }[] = [
  { key: 'equipment', section: 1, label: { kk: 'Негізгі зертханалық жабдықтар тізімі', en: 'List of basic Laboratory equipment' },
    columns: { kk: ['Коды', 'Жабдық атауы', 'Бірлік', 'Саны', 'Жабдықтаушы фирма'], en: ['Codes', 'Equipment name', 'Unit', 'Number', 'Supplier Company'] } },
  { key: 'equipment_extra', section: 1, label: { kk: 'Қосымша зертханалық жабдықтар тізімі', en: 'List of additional Laboratory equipment' },
    columns: { kk: ['Жабдық атауы', 'Бірлік', 'Саны', 'Жабдықтаушы фирма'], en: ['Equipment name', 'Unit', 'Number', 'Supplier Company'] } },
  { key: 'software', section: 1, label: { kk: 'Бағдарламалық құралдар тізімі', en: 'List of software' },
    columns: { kk: ['Атауы', 'Лицензияның саны', 'Қолдану саласы'], en: ['Name', 'Number of licences', 'Area of use'] } },
  { key: 'staff', section: 1, label: { kk: 'Зертхананың кадрлық әлеуеті', en: 'Staff resources of the Laboratory' },
    columns: { kk: ['Т.Ә.А.', 'Лауазымы', 'Білімі, ғылыми дәрежесі, ғылыми атағы', 'Байланыс ақпараты'], en: ['Full name', 'Position', 'Education, academic degree, academic title', 'Contact information'] } },
  { key: 'courses', section: 2, label: { kk: 'Зертхана базасында жүргізілетін оқу пәндері', en: 'Laboratory-based academic disciplines' },
    columns: { kk: ['Пән атауы (оқу курсы)', 'Дайындық бағыты', 'Сағат саны', 'Оқытушы'], en: ['Subject name (course)', 'Training direction', 'Number of hours', 'Teacher'] } },
  { key: 'students', section: 2, label: { kk: 'Зертхана базасында оқып өткен студенттер саны', en: 'Number of students who studied in Laboratory' },
    columns: { kk: ['Дайындау бағыты', 'Оқу жылы', 'Студенттер саны'], en: ['Direction of preparation', 'Academic year', 'Number of students'] } },
  { key: 'specs', section: 3, label: { kk: 'Жабдықтардың техникалық сипаттамасы', en: 'Technical specifications of equipment' },
    columns: { kk: ['Жабдықтардың атауы', 'Инвентарлық нөмірі', 'Сипаттамасы (техникалық сипаттамасы, конфигурация)'], en: ['Equipment name', 'Inventory number', 'Description (technical specifications, configuration)'] } },
  { key: 'projects', section: 4, label: { kk: 'Ғылыми жобалар мен гранттар', en: 'Research projects and grants' },
    columns: { kk: ['Жоба / грант атауы', 'Қаржыландыру көзі', 'Жылдары', 'Мәртебесі'], en: ['Project / grant', 'Funder', 'Years', 'Status'] } },
];

export const DEFAULT_APPROVER: Record<PassportLang, string[]> = {
  kk: ['«Ақпараттық технологиялар және қолданбалы математика» мектебінің', 'деканы, PhD, асс.профессор', 'Ахмедов Р.'],
  en: ['by the Dean of the', '“School of Information Technology and Applied Mathematics”', 'PhD, Ass.Professor', 'Ramis Akhmedov'],
};

export const tableOf = (doc: PassportDoc, key: TableKey): PassportTable => {
  const t = doc.tables[key];
  const def = TABLES.find((x) => x.key === key)!.columns[doc.lang];
  return t && t.columns.length ? t : { columns: def, rows: [] };
};
export const hasRows = (t?: PassportTable) => !!t && t.rows.some((r) => r.some((c) => c.trim()));

const lines = (xs: (string | null | undefined)[]) => xs.map((x) => (x ?? '').trim()).filter(Boolean);

/** A first version of the passport from what the lab profile already has (no saved passport yet). */
export function passportFromLab(lab: Lab): PassportDoc {
  const people = lab.lab_members.filter((m) => !m.is_past);
  const heads = people.filter((m) => HEAD_ROLES.includes(m.role));
  const eq = lines((lab.equipment ?? '').split(/\n|;|•/));
  return {
    v: 1, lang: 'kk', approver: DEFAULT_APPROVER.kk,
    general: { name: lab.name, location: lab.location || '', head: heads.map((h) => h.full_name).join(', '), specialization: lab.description || '' },
    tables: {
      equipment: { columns: TABLES[0]!.columns.kk, rows: eq.map((e) => ['', e, 'дана', '', '']) },
      staff: { columns: TABLES[3]!.columns.kk, rows: people.map((m) => [m.full_name, m.title ?? '', '', '']) },
      courses: { columns: TABLES[4]!.columns.kk, rows: lab.courses.map((c) => [c, '', '', '']) },
      projects: { columns: TABLES[7]!.columns.kk, rows: [...lab.grants.map((g) => [g, '', '', 'грант']), ...lab.ongoing_projects.map((p) => [p, '', '', 'жүріп жатыр']), ...lab.completed_projects.map((p) => [p, '', '', 'аяқталды'])] },
    },
    prepared: { role: 'Зертханаға жауапты', name: heads[0]?.full_name ?? '' },
    agreed: {},
  };
}

/** Reads a picture and returns it as a small JPEG data URL (the plan of the room). */
export function compressImage(file: File, max = 1100, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This file is not a picture.')); };
    img.src = url;
  });
}
