// SITAM SPACE — static copy and constants. All records (labs, projects, events,
// opportunities, professors, publications) come from the database.

export const BRAND = {
  name: 'SITAM.SPACE',
  short: 'SITAM SPACE',
  tagline: 'Industry & Research Ecosystem',
  school: 'School of Information Technologies and Applied Mathematics',
  // Official address for feedback and support (SDU Technopark).
  contactEmail: 'technopark@sdu.edu.kz',
  contactLabel: 'Feedback & support',
} as const;

// Departments offered at sign-up for professors and PhD students; "Other" lets people type their own.
export const DEPARTMENTS = ['SITAM', 'SE', 'SBL', 'Pedagogy', 'Humanities', 'Law', 'Business', 'Other'] as const;


export const EVENT_META = {
  industrial: { label: 'Industrial Days', short: 'Industrial', weekdayName: 'Thursday', time: '17:00' },
  research: { label: 'Research Days', short: 'Research', weekdayName: 'Tuesday', time: '17:00' },
} as const;

export const LAB_FOCUS = ['Research', 'Courses', 'Industry & Commercial Projects'] as const;

export type FaqAudience = 'all' | 'leader' | 'teacher' | 'student';
export const FAQ_AUDIENCE_LABEL: Record<FaqAudience, string> = { all: 'Everyone', leader: 'Lab leaders', teacher: 'Teachers', student: 'Students' };

/** Role guidance shown first in the FAQ (filterable by audience). */
export const roleFaqs: { q: string; a: string; audience: Exclude<FaqAudience, 'all'> }[] = [
  { audience: 'leader', q: 'How do I become a lab head?', a: 'Lab heads are assigned by the SITAM coordinator. Register and sign in once, then ask the coordinator to assign you to your lab. A student or a teacher can be a lab head; your account type does not change.' },
  { audience: 'leader', q: 'What can a lab head do?', a: 'Only for your own lab: edit all lab information, add and remove members (search registered users), create, edit and delete lab projects and events. Everyone else sees the lab read-only.' },
  { audience: 'teacher', q: 'How is my account type set?', a: 'You choose it when you register: Student, Teacher or Industry partner. Students and teachers register with their SDU e-mail.' },
  { audience: 'student', q: 'How do I join a lab?', a: 'A lab head adds you to the lab after you have signed in at least once. Labs also post Lab cases on the Opportunities page.' },
];

export const faqs = [
  { q: 'How do I register and sign in?', a: 'Open Register, choose Student, Teacher or Industry partner, fill in the form and you are signed in right away. Next time sign in with your e-mail and password. Forgot the password? Use “E-mail me a sign-in link” on the Sign in page.' },
  { q: 'I am a teacher. How do I offer a topic or position to students?', a: 'After the SITAM office verifies your account, open your profile → “Post an opportunity”. It appears on the Opportunities page automatically, and you see every applicant with contacts and CV in Manage → Applications.' },
  { q: 'Where do lab events, projects and vacancies appear?', a: 'Everywhere at once. When a lab head adds an event, a project or a vacancy on the lab page, it automatically shows up in Events, Projects or Opportunities.' },
  { q: 'How do I join a laboratory?', a: 'Labs post Lab Cases and Research Cases on the Opportunities page. Apply there — the CV from your registration is attached automatically, and you can replace it for a single application. Lab heads review applications in their inbox.' },
  { q: 'Can I use a different CV for one application?', a: 'Yes. When you apply, keep the CV from your profile or upload another PDF for that application only. Your profile CV stays unchanged.' },
  { q: 'I head a lab and I am also a student. Can I apply to company vacancies?', a: 'Yes. Roles are additive: lab-head rights let you manage your lab, and your student account can still apply anywhere except to your own lab’s listings.' },
  { q: 'How do lab heads update their lab page and projects?', a: 'On the Labs page open your lab: Edit, Add member, New project and New event appear only for its heads.' },
  { q: 'When and where are the events?', a: 'Research Days run on Tuesdays at 17:00 and Industrial Days on Thursdays at 17:00, in Room C1.2. An event can be hosted by several labs, companies or projects together. Register in one click to get a QR ticket.' },
  { q: 'Where do the publication numbers come from?', a: 'From the Scopus export: publications, citations, h-index and research topics per professor. Click a researcher to see all of their papers.' },
  { q: 'Who sees my data?', a: 'Your applications and CV are visible only to you and to the people reviewing that specific opportunity. Attendee lists are visible only to event organizers. Your name, role and e-mail are visible to signed-in members so they can write to you; your phone is not shown.' },
] as const;
