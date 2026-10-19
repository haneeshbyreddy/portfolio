/** Identity + copy. Everything personal lives here. */
export const site = {
  name: 'Haneesh Byreddy',
  /** The one-sheet wordmark, split like the poster: top-left / bottom-right. */
  wordmark: ['Field', 'work'] as const,
  discipline: 'Design + Engineering',
  since: '2019',
  email: 'hello@yourdomain.com',
  links: [
    { label: 'Read.cv', href: '#' },
    { label: 'LinkedIn', href: '#' },
    { label: 'GitHub', href: '#' },
  ],
  credits: [
    ['Brand', 'Identity'],
    ['Landing', 'Pages'],
    ['SaaS', 'Product'],
    ['Motion', 'Film'],
  ] as [string, string][],
  about:
    'An independent designer-engineer building brands, websites and products that feel considered down to the last pixel. This floor is the body of work — every desk a project, every empty one an invitation.',
};
