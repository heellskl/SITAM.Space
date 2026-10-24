export function pageHead(title: string, description: string) {
  return {
    meta: [
      { title: `${title} — SITAM SPACE · SDU` },
      { name: 'description', content: description },
      { property: 'og:title', content: `${title} — SITAM SPACE` },
      { property: 'og:description', content: description },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  };
}
