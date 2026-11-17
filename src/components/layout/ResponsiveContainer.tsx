import type {ReactNode} from 'react';
import {cn} from '@/src/lib/cn';

export type ContainerSize = 'sm' | 'md' | 'lg' | 'xl';

const CONTAINER_MAX: Record<ContainerSize, string> = {
  sm: 'max-w-3xl',
  md: 'max-w-5xl',
  lg: 'max-w-[1200px]',
  xl: 'max-w-[1440px]',
};

export interface ResponsiveContainerProps {
  size?: ContainerSize;
  className?: string;
  children: ReactNode;
  as?: 'div' | 'section' | 'main' | 'header' | 'footer';
}

export function ResponsiveContainer({
  size = 'lg',
  className,
  children,
  as: Component = 'div',
}: ResponsiveContainerProps) {
  return (
    <Component className={cn('mx-auto w-full px-4 sm:px-6 lg:px-8', CONTAINER_MAX[size], className)}>
      {children}
    </Component>
  );
}
