import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { bootstrapApp } from '@/lib/bootstrap';

export default async function Home() {
  await bootstrapApp();
  const user = await getSessionUser();
  if (user) redirect('/dashboard');
  redirect('/login');
}
