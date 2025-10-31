import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || String(req.query.secret) !== secret) {
    return res.status(401).json({ message: 'Invalid secret' });
  }

  try {
    // Support both Next.js response variants
    const revalidateFn = (res as any).revalidate || (res as any).unstable_revalidate;
    if (!revalidateFn) {
      return res.status(500).json({ revalidated: false, error: 'Revalidate not available' });
    }
    await revalidateFn('/');
    return res.json({ revalidated: true });
  } catch (err) {
    return res.status(500).json({ revalidated: false, error: String(err) });
  }
}
