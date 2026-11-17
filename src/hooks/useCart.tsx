import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiClient, setStoredCartToken } from '@/src/lib/apiClient';

export interface CartItem {
  id: string;
  variantId: string;
  productId: string;
  slug: string;
  sku: string;
  size: string;
  colorName: string;
  colorHex: string;
  quantity: number;
  availableQty: number;
  unitPriceBdt: number;
  lineTotalBdt: number;
  imageUrl: string | null;
  name: { en: string; bn: string };
}

export interface CartState {
  cartId: string | null;
  items: CartItem[];
  subtotalBdt: number;
  itemCount: number;
}

interface CartContextValue {
  cart: CartState;
  isLoading: boolean;
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  refreshCart: () => Promise<void>;
  addItem: (variantId: string, quantity?: number, openSlideDrawer?: boolean) => Promise<void>;
  updateQuantity: (variantId: string, quantity: number) => Promise<void>;
  removeItem: (variantId: string) => Promise<void>;
}

const EMPTY_CART: CartState = {
  cartId: null,
  items: [],
  subtotalBdt: 0,
  itemCount: 0,
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartState>(EMPTY_CART);
  const [isLoading, setIsLoading] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const syncCartPayload = (data: CartState & { sessionToken?: string }) => {
    if (data.sessionToken) {
      setStoredCartToken(data.sessionToken);
    }
    setCart({
      cartId: data.cartId ?? null,
      items: data.items ?? [],
      subtotalBdt: Number(data.subtotalBdt ?? 0),
      itemCount: Number(data.itemCount ?? 0),
    });
  };

  const refreshCart = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get<CartState & { sessionToken?: string }>('/api/v1/cart');
      syncCartPayload(data);
    } catch {
      // Keep local empty state if backend is unreachable in unit tests
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCart();
  }, [refreshCart]);

  const addItem = useCallback(async (variantId: string, quantity = 1, openSlideDrawer = true) => {
    const data = await apiClient.post<CartState & { sessionToken?: string }>('/api/v1/cart/items', {
      variantId,
      quantity,
    });
    syncCartPayload(data);
    if (openSlideDrawer) {
      setIsDrawerOpen(true);
    }
  }, []);

  const updateQuantity = useCallback(async (variantId: string, quantity: number) => {
    const data = await apiClient.patch<CartState & { sessionToken?: string }>(
      `/api/v1/cart/items/${variantId}`,
      { quantity },
    );
    syncCartPayload(data);
  }, []);

  const removeItem = useCallback(async (variantId: string) => {
    const data = await apiClient.delete<CartState & { sessionToken?: string }>(
      `/api/v1/cart/items/${variantId}`,
    );
    syncCartPayload(data);
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      isLoading,
      isDrawerOpen,
      openDrawer: () => setIsDrawerOpen(true),
      closeDrawer: () => setIsDrawerOpen(false),
      refreshCart,
      addItem,
      updateQuantity,
      removeItem,
    }),
    [cart, isLoading, isDrawerOpen, refreshCart, addItem, updateQuantity, removeItem],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used inside CartProvider.');
  }
  return ctx;
}
