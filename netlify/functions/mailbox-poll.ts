export default async () => {
  await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/mailbox/poll`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
};
