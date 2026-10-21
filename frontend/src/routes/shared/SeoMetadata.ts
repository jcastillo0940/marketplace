import { useEffect } from 'react';

import { useLocation } from 'react-router-dom';

export function useSeoMetadata(title: string, description: string, image?: string, type: 'website' | 'product' | 'profile' = 'website') {
  const location = useLocation()
  useEffect(() => {
    const defaultTitle = 'El Empujoncito · El interior produce, Panamá conecta'
    const defaultDescription = 'Encuentra productos y emprendimientos de productores locales de Panamá. Contacta directamente y apoya lo local.'
    const setMeta = (selector: string, attribute: string, value: string) => {
      let element = document.head.querySelector<HTMLMetaElement>(selector)
      if (!element) {
        element = document.createElement('meta')
        if (selector.startsWith('meta[property=')) element.setAttribute('property', selector.match(/\[property="([^"]+)"\]/)?.[1] ?? '')
        else element.name = selector.match(/\[name="([^"]+)"\]/)?.[1] ?? ''
        document.head.appendChild(element)
      }
      element.setAttribute(attribute, value)
    }
    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]') ?? document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'canonical' }))
    document.title = title
    setMeta('meta[name="description"]', 'content', description)
    setMeta('meta[property="og:title"]', 'content', title)
    setMeta('meta[property="og:description"]', 'content', description)
    setMeta('meta[property="og:type"]', 'content', type)
    const canonicalUrl = `${window.location.origin}${location.pathname}`
    setMeta('meta[property="og:url"]', 'content', canonicalUrl)
    setMeta('meta[name="twitter:title"]', 'content', title)
    setMeta('meta[name="twitter:description"]', 'content', description)
    if (image) {
      setMeta('meta[property="og:image"]', 'content', image)
      setMeta('meta[name="twitter:image"]', 'content', image)
    } else {
      document.head.querySelector('meta[property="og:image"]')?.remove()
      document.head.querySelector('meta[name="twitter:image"]')?.remove()
    }
    canonical.href = canonicalUrl
    return () => {
      document.title = defaultTitle
      document.head.querySelector('meta[name="description"]')?.setAttribute('content', defaultDescription)
      document.head.querySelector('meta[property="og:title"]')?.setAttribute('content', defaultTitle)
      document.head.querySelector('meta[property="og:description"]')?.setAttribute('content', defaultDescription)
      document.head.querySelector('meta[property="og:type"]')?.setAttribute('content', 'website')
      document.head.querySelector('meta[property="og:url"]')?.setAttribute('content', `${window.location.origin}/`)
      document.head.querySelector('meta[name="twitter:title"]')?.setAttribute('content', defaultTitle)
      document.head.querySelector('meta[name="twitter:description"]')?.setAttribute('content', defaultDescription)
      document.head.querySelector('meta[property="og:image"]')?.remove()
      document.head.querySelector('meta[name="twitter:image"]')?.remove()
      canonical.href = `${window.location.origin}/`
    }
  }, [description, image, location.pathname, title, type])
}