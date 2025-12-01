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
    {
      name: 'Sarah Wilson',
      bio: 'Marketing expert with a focus on digital transformation and customer experience.',
    },
    {
      name: 'David Brown',
      bio: 'Financial analyst and investment advisor with expertise in emerging markets.',
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
    {
      slug: 'blog',
      title: 'Latest News and Updates',
    },
    {
      slug: 'products',
      title: 'Product Catalog and Features',
    },
    {
      slug: 'support',
      title: 'Customer Support and Help',
    },
    {
      slug: 'pricing',
      title: 'Pricing Plans and Options',
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
    {
      slug: 'digital-marketing-strategies',
      title: 'Effective Digital Marketing Strategies for 2024',
      author: authorIds[3],
    },
    {
      slug: 'investment-opportunities',
      title: 'Top Investment Opportunities in Emerging Markets',
      author: authorIds[4],
    },
    {
      slug: 'react-performance-optimization',
      title: 'React Performance Optimization Techniques',
      author: authorIds[2],
    },
    {
      slug: 'climate-change-solutions',
      title: 'Innovative Solutions to Combat Climate Change',
      author: authorIds[1],
    },
    {
      slug: 'customer-experience-design',
      title: 'Designing Exceptional Customer Experiences',
      author: authorIds[3],
    },
    {
      slug: 'typescript-advanced-features',
      title: 'Advanced TypeScript Features You Should Know',
      author: authorIds[2],
    },
    {
      slug: 'financial-planning-guide',
      title: 'A Comprehensive Guide to Financial Planning',
      author: authorIds[4],
    },
    {
      slug: 'nextjs-development-tips',
      title: 'Essential Tips for Next.js Development',
      author: authorIds[0],
    },
    {
      slug: 'renewable-energy-future',
      title: 'The Future of Renewable Energy Technologies',
      author: authorIds[1],
    },
    {
      slug: 'brand-building-strategies',
      title: 'Building a Strong Brand in the Digital Age',
      author: authorIds[3],
    },
    {
      slug: 'cryptocurrency-investment',
      title: 'Understanding Cryptocurrency Investment Risks',
      author: authorIds[4],
    },
    {
      slug: 'api-design-principles',
      title: 'Best Practices for API Design and Development',
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
