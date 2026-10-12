import type { Db } from '../db';

/** Inserts the starting campaign and product when the database is empty. Safe to run repeatedly. */
export async function seedDefaults(db: Db, opts: { demoStock?: number } = {}) {
  const [{ n }] = await db.q<{ n: number }>('SELECT COUNT(*)::int AS n FROM campaigns');
  if (n === 0) {
    await db.q(
      `INSERT INTO campaigns(name, festival, theme, hero, promo_heading, promo_description, active)
       VALUES ($1,$2,$3::jsonb,$4::jsonb,$5,$6,TRUE)`,
      [
        'Diwali', 'Diwali',
        JSON.stringify({ primary: '#E9A820', accent: '#B45309', dark: '#2B1608', bg: '#FFF8EC', text: '#3A2412' }),
        JSON.stringify({
          desktopImage: '/images/hero-diyas.jpg',
          mobileImage: '',
          heading: 'Make your home glow this festive season',
          subheading: 'Colourful flower-shaped glowing diyas',
          ctaText: 'Shop now',
        }),
        'Festive glow for your home',
        'Colourful, translucent, flower-shaped glowing decorative diyas.',
      ],
    );
  }
  const [{ p }] = await db.q<{ p: number }>('SELECT COUNT(*)::int AS p FROM products');
  if (p === 0) {
    const [prod] = await db.q<{ id: number }>(
      `INSERT INTO products(slug, name, description, pieces_per_box) VALUES ($1,$2,$3,12) RETURNING id`,
      [
        'glowing-flower-diya',
        'Glowing Flower Diya (box of 12)',
        'Colourful, translucent, flower-shaped glowing decorative diyas. 12 pieces per box.',
      ],
    );
    await db.q('INSERT INTO price_tiers(product_id, min_qty, unit_price) VALUES ($1,1,150), ($1,2,120)', [prod.id]);
    const imgs: [string, string][] = [
      ['/images/diyas-five-colours.jpg', 'Five glowing flower-shaped diyas in pink, green, blue, yellow and red'],
      ['/images/diya-red.jpg', 'A red glowing flower-shaped diya, close up'],
      ['/images/hero-diyas.jpg', 'Glowing flower-shaped diyas on a brass tray with marigolds'],
    ];
    for (const [i, [url, alt]] of imgs.entries()) {
      await db.q('INSERT INTO product_images(product_id, url, alt, sort) VALUES ($1,$2,$3,$4)', [prod.id, url, alt, i]);
    }
    if (opts.demoStock) {
      await db.q(`INSERT INTO inventory_movements(product_id, delta, kind, note, actor) VALUES ($1,$2,'add','Demo stock (development only)','seed')`, [prod.id, opts.demoStock]);
    }
  }
}
