import type { CollectionSlug, Payload } from 'payload'

import { devUser } from './helpers/credentials'

interface AuthorSeedData {
  name: string
  bio: string
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

  const pages: PageSeedData[] = [
    {
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
    const { totalDocs: existingPage } = await payload.count({
      collection: 'pages' as CollectionSlug,
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
