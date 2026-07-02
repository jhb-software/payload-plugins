import type { CollectionSlug, Payload } from 'payload'

import { devUser } from './helpers/credentials'

interface AuthorSeedData {
  name: string
  bio: string
}

interface DocSeedData {
  keywords: string[]
  slug: string
  title: string
}

interface PageSeedData {
  slug: string
  title: string
}

interface PostSeedData {
  slug: string
  title: string
  author: string | number
}

export const seed = async (payload: Payload) => {
  const { totalDocs } = await payload.count({
    collection: 'users',
    where: {
      email: {
        equals: devUser.email,
      },
    },
  })

  if (!totalDocs) {
    await payload.create({
      collection: 'users',
      data: devUser,
    })
  }

  const authors: AuthorSeedData[] = [
    {
      name: 'John Doe',
      bio: 'A passionate writer with over 10 years of experience in technology and business.',
    },
    {
      name: 'Jane Smith',
      bio: 'Freelance journalist specializing in environmental issues and sustainable living.',
    },
    {
      name: 'Mike Johnson',
      bio: 'Tech enthusiast and software developer who loves sharing knowledge about programming.',
    },
  ]

  const authorIds: Array<string | number> = []

  for (const authorData of authors) {
    const { docs: existingAuthor } = await payload.find({
      collection: 'authors' as CollectionSlug,
      depth: 0,
      where: { name: { equals: authorData.name } },
    })

    if (!existingAuthor.length) {
      const author = await payload.create({
        collection: 'authors' as CollectionSlug,
        data: authorData,
      })
      authorIds.push(author.id)
    } else {
      authorIds.push(existingAuthor[0].id)
    }
  }

  // `docs` is the hand-rolled collection: it owns the keyword-rich content that
  // exercises the translator across hasMany, groups, tabs and rich text.
  const docs: DocSeedData[] = [
    {
      slug: 'home',
      keywords: ['welcome', 'home page', 'getting started'],
      title: 'Welcome to Our Website',
    },
    {
      slug: 'about',
      keywords: ['company', 'team', 'our story'],
      title: 'About Our Company',
    },
    {
      slug: 'services',
      keywords: ['services', 'solutions', 'consulting'],
      title: 'Our Services and Solutions',
    },
    {
      slug: 'contact',
      keywords: ['contact', 'support', 'get in touch'],
      title: 'Get in Touch With Us',
    },
  ]

  for (const docData of docs) {
    // slug is localized: match against the default locale the seed writes to
    // (via find, which honors `locale` — count does not), otherwise the query
    // never matches and the seed is not idempotent.
    const { totalDocs: existingDoc } = await payload.find({
      collection: 'docs' as CollectionSlug,
      depth: 0,
      limit: 1,
      locale: 'en',
      where: { slug: { equals: docData.slug } },
    })

    if (!existingDoc) {
      await payload.create({
        collection: 'docs' as CollectionSlug,
        data: docData,
      })
    }
  }

  // `pages` is managed by the Pages plugin: its slug field is injected, and
  // `makeSlugTranslatable` derives the slug from the translated title. Seed a
  // couple of entries so the slug-on-translate behavior is clickable.
  const pages: PageSeedData[] = [
    { slug: 'travel-tips', title: 'Travel Tips' },
    { slug: 'our-mission', title: 'Our Mission' },
  ]

  for (const pageData of pages) {
    const { totalDocs: existingPage } = await payload.find({
      collection: 'pages' as CollectionSlug,
      depth: 0,
      limit: 1,
      locale: 'en',
      where: { slug: { equals: pageData.slug } },
    })

    if (!existingPage) {
      await payload.create({
        collection: 'pages' as CollectionSlug,
        data: pageData,
      })
    }
  }

  const posts: PostSeedData[] = [
    {
      slug: 'getting-started-with-web-development',
      title: 'Getting Started with Web Development: A Complete Guide',
      author: authorIds[0],
    },
    {
      slug: 'sustainable-living-tips',
      title: '10 Easy Ways to Live More Sustainably',
      author: authorIds[1],
    },
    {
      slug: 'javascript-best-practices',
      title: 'JavaScript Best Practices for Modern Applications',
      author: authorIds[2],
    },
  ]

  for (const postData of posts) {
    const { totalDocs: existingPost } = await payload.find({
      collection: 'posts' as CollectionSlug,
      depth: 0,
      limit: 1,
      locale: 'en',
      where: { slug: { equals: postData.slug } },
    })

    if (!existingPost) {
      await payload.create({
        collection: 'posts' as CollectionSlug,
        data: postData,
      })
    }
  }

  console.log('✅ Seed data created successfully!')
  console.log(
    `📊 Created ${authors.length} authors, ${docs.length} docs, ${pages.length} pages, and ${posts.length} posts`,
  )
}
