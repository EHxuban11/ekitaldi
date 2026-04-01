# Ekitaldi

I'm an engineer who is getting into photography. After a shooting session for a tech event, I needed somewhere to host the photos so the other attendees could view and download them. The go-to for this is [Pixieset](https://pixieset.com). It works great, but it's ~$20/month.

I figured I could build my own. So I did. Took about three hours from idea to production.

![Demo](demo.gif)

Ekitaldi is a self-hosted photo gallery platform. It has a frontend, a backend, a database, and scalable blob storage for the images. It handles multiple galleries for multiple clients. There's an admin dashboard behind GitHub login, and each gallery can have its own password so only your clients see their photos.

The whole thing runs on free tiers: Vercel for hosting, Neon for the database, Cloudflare R2 for photo storage. As long as you stay under 10GB of storage on R2 (that's hundreds of galleries), it's free forever. $0/month.

You can see it running in production at [ekitaldi.org](https://ekitaldi.org).

## What it does

- Masonry grid galleries with a full-screen lightbox
- Password-protected galleries for client privacy
- Admin dashboard to manage everything
- Photo downloads
- Sharing (WhatsApp, email, socials)
- EXIF stripping so your clients' location data stays private
- Works on mobile

## Stack

- Vercel for hosting (free)
- Neon Postgres for the database (free)
- Cloudflare R2 for photo storage (free up to 10GB)
- GitHub OAuth for admin auth

## Setup

```bash
git clone https://github.com/EHxuban11/ekitaldi.git
cd ekitaldi
npm install
cp .env.example .env.local
# fill in your credentials (see .env.example for what you need)
npx prisma db push
npm run dev
```

You'll need to set up a [Neon](https://neon.tech) database, a [Cloudflare R2](https://dash.cloudflare.com) bucket, and a [GitHub OAuth app](https://github.com/settings/developers).

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/EHxuban11/ekitaldi)

Or just `vercel deploy` from the CLI.

## License

MIT
