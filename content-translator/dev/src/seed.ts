import type { CollectionSlug, Payload } from 'payload'

import { devUser } from './helpers/credentials'

interface AuthorSeedData {
  name: string
  bio: string
}

interface PageSeedData {
  content?: string[]
  slug: string
  title: string
}

/** Build a minimal lexical richText value from plain-text paragraphs. */
const lexical = (paragraphs: string[]) => ({
  root: {
    type: 'root',
    children: paragraphs.map((text) => ({
      type: 'paragraph',
      children: [
        { type: 'text', detail: 0, format: 0, mode: 'normal', style: '', text, version: 1 },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      textFormat: 0,
      version: 1,
    })),
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  },
})

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

  const pages: PageSeedData[] = [
    {
      // Source content for trying incremental richText translation. To see each
      // case of the classification table:
      //   1. open this page, switch to the German locale, "Translate all fields"
      //   2. switch back to English, add / edit / reorder / delete a paragraph
      //   3. switch to German, "Translate new & changed content" — only the
      //      changed paragraph is translated; the rest (incl. any manual edits
      //      you made to the German text) are preserved
      content: [
        'Welcome to our company. We build software that helps teams move faster.',
        'Our mission is to make complex workflows feel simple and reliable.',
        'Get in touch to learn how we can help your organisation.',
      ],
      slug: 'home',
      title: 'Welcome to Our Website',
    },
    {
      slug: 'about',
      title: 'About Our Company',
    },
    {
      slug: 'services',
      title: 'Our Services and Solutions',
    },
    {
      slug: 'contact',
      title: 'Get in Touch With Us',
    },
  ]

  for (const pageData of pages) {
    const { docs } = await payload.find({
      collection: 'pages' as CollectionSlug,
      depth: 0,
      limit: 1,
      where: { slug: { equals: pageData.slug } },
    })

    const existingPage = docs[0] as { content?: unknown; id: number | string } | undefined

    if (!existingPage) {
      await payload.create({
        collection: 'pages' as CollectionSlug,
        data: {
          slug: pageData.slug,
          title: pageData.title,
          ...(pageData.content ? { content: lexical(pageData.content) } : {}),
        } as Record<string, unknown>,
      })
    } else if (pageData.content && !existingPage.content) {
      // Backfill demo content onto a page seeded before it had any.
      await payload.update({
        collection: 'pages' as CollectionSlug,
        id: existingPage.id,
        data: { content: lexical(pageData.content) } as Record<string, unknown>,
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
    const { totalDocs: existingPost } = await payload.count({
      collection: 'posts' as CollectionSlug,
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
    `📊 Created ${authors.length} authors, ${pages.length} pages, and ${posts.length} posts`,
  )
}
