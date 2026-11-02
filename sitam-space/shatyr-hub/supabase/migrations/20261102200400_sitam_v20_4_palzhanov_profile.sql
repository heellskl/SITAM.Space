-- SITAM SPACE v20.4 — Yerbol Palzhanov: position, "For students" / reading group text and research interests
-- (from his own page, 2026-11-02). Re-runnable.
update public.professors set
  job_title = 'Assistant Professor SDU',
  bio = $bio$For students: if you are an undergraduate or graduate student interested in working with me, take a look at my research areas. If any of these topics interest you and you would like to explore a possible research project, feel free to reach out to me. Projects can range from introductory computational work to more advanced research problems, depending on your background and interests. Helpful preparation includes linear algebra, numerical analysis, and scientific programming.

Reading group: I organize a weekly research reading group at SDU University. We study foundational ideas in computational mathematics and fluid dynamics and discuss recent papers and developments related to our research interests. Location: TBD. Book for Fall 2026: Steven L. Brunton and J. Nathan Kutz, Data-Driven Science and Engineering (https://databookuw.com/).$bio$,
  interests = array['Computational mathematics', 'Fluid dynamics', 'Numerical analysis', 'Finite element methods', 'Phase-field models', 'Scientific computing'],
  updated_at = now()
where username = 'yerbol.palzhanov';
