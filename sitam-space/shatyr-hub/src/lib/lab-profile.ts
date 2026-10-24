// Short card copy and accent colour per lab, derived from its name (and its own tags when nothing matches).
// The colour is used ONLY for the card icon; everything else on the card stays neutral.

import type { Lab } from '@/lib/api';

export type LabTone = 'blue' | 'violet' | 'teal' | 'coral' | 'red' | 'amber' | 'green' | 'indigo' | 'pink' | 'slate';
export type LabIconKey = 'chart' | 'brain' | 'globe' | 'palette' | 'shield' | 'server' | 'bot' | 'wallet' | 'heart' | 'book' | 'boxes' | 'flask' | 'eye' | 'chat';
export type LabProfile = { line: string; tags: string[]; tone: LabTone; icon: LabIconKey };

const RULES: { test: RegExp; profile: LabProfile }[] = [
  // v10: the school's 21 labs — specific names first, then the general topic rules below
  { test: /red ?hat/i, profile: { line: 'Linux and open-source infrastructure with Red Hat Academy.', tags: ['Linux', 'RHEL', 'Ansible'], tone: 'red', icon: 'server' } },
  { test: /fortinet/i, profile: { line: 'Network security training on Fortinet technologies.', tags: ['FortiGate', 'Firewalls', 'NSE'], tone: 'red', icon: 'shield' } },
  { test: /cisco/i, profile: { line: 'Cisco Networking Academy: routing, switching, certification.', tags: ['CCNA', 'Routing', 'Switching'], tone: 'blue', icon: 'server' } },
  { test: /cloud/i, profile: { line: 'Cloud platforms, virtualisation and DevOps practice.', tags: ['AWS', 'Docker', 'Kubernetes'], tone: 'amber', icon: 'server' } },
  { test: /micro.?electronic|chip/i, profile: { line: 'Chip design and microelectronics, from circuits to boards.', tags: ['VLSI', 'FPGA', 'PCB'], tone: 'green', icon: 'bot' } },
  { test: /\biot\b/i, profile: { line: 'Connected devices, sensors and embedded systems.', tags: ['IoT', 'Arduino', 'Sensors'], tone: 'green', icon: 'bot' } },
  { test: /physics/i, profile: { line: 'Experiments and modelling in physics.', tags: ['Physics', 'Experiments', 'Modelling'], tone: 'indigo', icon: 'flask' } },
  { test: /statistic/i, profile: { line: 'Statistical modelling, probability and data analysis.', tags: ['Statistics', 'R', 'Probability'], tone: 'blue', icon: 'chart' } },
  { test: /^analysis\b/i, profile: { line: 'Mathematical analysis: seminars, research and student projects.', tags: ['Analysis', 'PDE', 'Research'], tone: 'indigo', icon: 'flask' } },
  { test: /algebra/i, profile: { line: 'Algebra research and problem-solving seminars.', tags: ['Algebra', 'Number theory', 'Research'], tone: 'indigo', icon: 'flask' } },
  { test: /applied math/i, profile: { line: 'Applied mathematics and mathematical modelling.', tags: ['Modelling', 'Numerics', 'Research'], tone: 'indigo', icon: 'flask' } },
  { test: /\bmcm\b/i, profile: { line: 'Olympiad training and student research in mathematics.', tags: ['Olympiads', 'Control theory', 'Fractional calculus'], tone: 'indigo', icon: 'flask' } },
  { test: /3d/i, profile: { line: '3D modelling, printing and digital fabrication.', tags: ['3D modelling', '3D printing', 'CAD'], tone: 'coral', icon: 'boxes' } },
  { test: /computer vision/i, profile: { line: 'Computer vision for images, video and sensors.', tags: ['OpenCV', 'PyTorch', 'CV'], tone: 'violet', icon: 'eye' } },
  { test: /distributed/i, profile: { line: 'Distributed systems and big-data computing.', tags: ['Big data', 'Spark', 'Distributed'], tone: 'amber', icon: 'server' } },
  { test: /data|analytic|statistic/i, profile: { line: 'Turns real-world data into models, dashboards and papers.', tags: ['Python', 'ML', 'Pandas'], tone: 'blue', icon: 'chart' } },
  { test: /\bai\b|artificial|machine learning|\bml\b|deep|neural/i, profile: { line: 'Builds and studies machine-learning and AI systems.', tags: ['PyTorch', 'LLMs', 'CV'], tone: 'violet', icon: 'brain' } },
  { test: /nlp|language|linguist|text/i, profile: { line: 'Language technology, with a focus on Kazakh and Russian.', tags: ['NLP', 'LLMs', 'Python'], tone: 'indigo', icon: 'chat' } },
  { test: /vision|image|video/i, profile: { line: 'Computer vision for images, video and sensors.', tags: ['OpenCV', 'PyTorch', 'CV'], tone: 'violet', icon: 'eye' } },
  { test: /web|frontend|full.?stack|software|app/i, profile: { line: 'Designs and ships web and mobile products.', tags: ['React', 'TypeScript', 'Node'], tone: 'teal', icon: 'globe' } },
  { test: /design|ux|ui|creative|media/i, profile: { line: 'Product, interface and visual design studio.', tags: ['Figma', 'UX', 'Prototyping'], tone: 'coral', icon: 'palette' } },
  { test: /secur|cyber|crypto(?!currency)|forensic/i, profile: { line: 'Defends systems: pentesting, CTFs and secure code.', tags: ['Pentest', 'CTF', 'Linux'], tone: 'red', icon: 'shield' } },
  { test: /devops|cloud|infra|network|system/i, profile: { line: 'Cloud, infrastructure and reliable delivery pipelines.', tags: ['Docker', 'Kubernetes', 'CI/CD'], tone: 'amber', icon: 'server' } },
  { test: /robot|iot|embedded|hardware|drone|electronic/i, profile: { line: 'Robots, embedded devices and connected hardware.', tags: ['Arduino', 'ROS', 'C++'], tone: 'green', icon: 'bot' } },
  { test: /fin|bank|blockchain|business|econom/i, profile: { line: 'Technology for finance, markets and payments.', tags: ['FinTech', 'Blockchain', 'Python'], tone: 'amber', icon: 'wallet' } },
  { test: /health|bio|med|clinic/i, profile: { line: 'Computing for health and the life sciences.', tags: ['Bioinformatics', 'ML', 'Python'], tone: 'pink', icon: 'heart' } },
  { test: /edu|learn|teach|school/i, profile: { line: 'Learning technology and how people learn with it.', tags: ['EdTech', 'Analytics', 'UX'], tone: 'teal', icon: 'book' } },
  { test: /game|vr|ar\b|xr|3d/i, profile: { line: 'Games, 3D and immersive experiences.', tags: ['Unity', 'C#', '3D'], tone: 'coral', icon: 'boxes' } },
  { test: /math|quantum|algorithm|theor/i, profile: { line: 'Mathematics, algorithms and theoretical computing.', tags: ['Algorithms', 'Math', 'Python'], tone: 'indigo', icon: 'flask' } },
];

export function labProfile(lab: Pick<Lab, 'name' | 'slug' | 'tags' | 'skills' | 'focus'>): LabProfile {
  const hay = `${lab.name} ${lab.slug}`;
  const hit = RULES.find((r) => r.test.test(hay)) ?? RULES.find((r) => r.test.test(lab.tags.join(' ')));
  if (hit) {
    const own = [...(lab.skills ?? []), ...lab.tags].filter(Boolean);
    return { ...hit.profile, tags: (own.length >= 2 ? own : hit.profile.tags).slice(0, 3) };
  }
  const base = lab.name.replace(/\s*lab(oratory)?\s*$/i, '').trim() || lab.name;
  return {
    line: `Research, projects and courses in ${base}.`,
    tags: [...(lab.skills ?? []), ...lab.tags, ...lab.focus].slice(0, 3),
    tone: 'slate',
    icon: 'flask',
  };
}
