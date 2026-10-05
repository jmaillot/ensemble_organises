import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { ModuleShell } from '@/components/shared/module-shell';
import { ProductCatalog } from './components/product-catalog';
import { useCourses } from './hooks/use-courses';

/** Catalogue des produits scannés : espace dédié, photo/code/rayon éditables. */
export default function ProductCatalogPage() {
  const navigate = useNavigate();
  const { products, editProduct } = useCourses();

  return (
    <ModuleShell
      module="courses"
      actions={
        <Button variant="secondary" icon="arrowLeft" onClick={() => navigate('/courses')}>
          Listes
        </Button>
      }
    >
      <ProductCatalog products={products} onEdit={editProduct} />
    </ModuleShell>
  );
}
