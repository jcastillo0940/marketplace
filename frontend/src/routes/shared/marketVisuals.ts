import { Apple, Beef, Carrot, Coffee, Droplet, Egg, Fish, Flower2, Leaf, Package, Palette, Shirt, ShoppingBasket, SprayCan, Sprout, Wheat, type LucideIcon } from 'lucide-react'
import frutas360 from '../../assets/mercapro/categories/frutas-verduras-360.webp'
import frutas720 from '../../assets/mercapro/categories/frutas-verduras-720.webp'
import carnes360 from '../../assets/mercapro/categories/carnes-360.webp'
import carnes720 from '../../assets/mercapro/categories/carnes-720.webp'
import pescados360 from '../../assets/mercapro/categories/pescados-mariscos-360.webp'
import pescados720 from '../../assets/mercapro/categories/pescados-mariscos-720.webp'
import campo360 from '../../assets/mercapro/categories/del-campo-360.webp'
import campo720 from '../../assets/mercapro/categories/del-campo-720.webp'
import artesanias360 from '../../assets/mercapro/categories/artesanias-360.webp'
import artesanias720 from '../../assets/mercapro/categories/artesanias-720.webp'
import lacteos360 from '../../assets/mercapro/categories/lacteos-huevos-360.webp'
import lacteos720 from '../../assets/mercapro/categories/lacteos-huevos-720.webp'
import otros360 from '../../assets/mercapro/categories/otros-productos-360.webp'
import otros720 from '../../assets/mercapro/categories/otros-productos-720.webp'

const CATEGORY_ICON_RULES: Array<[RegExp, LucideIcon, string]> = [
  [/carne|pollo|cerdo|res\b/i, Beef, 'meat'],
  [/pescad|marisc/i, Fish, 'fish'],
  [/productos artesanal|miel|dulce|conserva/i, Flower2, 'honey'],
  [/frut|verdur|aliment|fresc/i, Carrot, 'fresh'],
  [/artesan|canast|tejid/i, ShoppingBasket, 'craft'],
  [/planta|vivero|flor/i, Sprout, 'plants'],
  [/ropa|accesorio|textil/i, Shirt, 'clothes'],
  [/hogar|limpieza|jab/i, SprayCan, 'home'],
  [/huevo|l[aá]cteo|queso/i, Egg, 'dairy'],
  [/caf[eé]|bebida|cacao/i, Coffee, 'coffee'],
  [/campo|grano|arroz/i, Wheat, 'field'],
  [/arte|pintur/i, Palette, 'art'],
]

/** Icono y tono visual de una categoría, deducidos de su nombre. */
export function categoryVisual(name: string): { Icon: LucideIcon; tone: string } {
  const match = CATEGORY_ICON_RULES.find(([pattern]) => pattern.test(name))
  return match ? { Icon: match[1], tone: match[2] } : { Icon: Apple, tone: 'other' }
}


/**
 * Fotos por categoría (slug → imagen 360 px, srcset 360/720 px e icono de su tarjeta).
 * Mientras una categoría no tenga foto se muestra su ilustración con icono.
 */
export const CATEGORY_PHOTOS: Record<string, { src: string; srcSet: string; Icon: LucideIcon }> = {
  'frutas-y-verduras': { src: frutas360, srcSet: `${frutas360} 360w, ${frutas720} 720w`, Icon: Leaf },
  'carnes': { src: carnes360, srcSet: `${carnes360} 360w, ${carnes720} 720w`, Icon: Beef },
  'pescados-y-mariscos': { src: pescados360, srcSet: `${pescados360} 360w, ${pescados720} 720w`, Icon: Fish },
  'del-campo': { src: campo360, srcSet: `${campo360} 360w, ${campo720} 720w`, Icon: Wheat },
  'artesanias': { src: artesanias360, srcSet: `${artesanias360} 360w, ${artesanias720} 720w`, Icon: ShoppingBasket },
  'lacteos-y-huevos': { src: lacteos360, srcSet: `${lacteos360} 360w, ${lacteos720} 720w`, Icon: Droplet },
  'otros-productos': { src: otros360, srcSet: `${otros360} 360w, ${otros720} 720w`, Icon: Package },
}
