'use client'

import React, { createContext, useContext, useRef, useCallback, useEffect } from 'react';

type ScrollContextType = {
  registerSection: (id: string, ref: React.RefObject<HTMLElement>) => void;
  scrollToSection: (id: string) => void;
};

const ScrollContext = createContext<ScrollContextType | undefined>(undefined);

export function ScrollProvider({ children }: { children: React.ReactNode }) {
  const sectionsRef = useRef<Record<string, React.RefObject<HTMLElement>>>({});
  
  const registerSection = useCallback((id: string, ref: React.RefObject<HTMLElement>) => {
    sectionsRef.current[id] = ref;
  }, []);
  
  const scrollToSection = useCallback((id: string) => {
    const section = sectionsRef.current[id];
    if (section && section.current) {
      section.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'start'
      });
    } else {
      console.warn(`Section with id "${id}" not found or not yet registered.`);
    }
  }, []);
  
  const contextValue = React.useMemo(() => ({
    registerSection,
    scrollToSection
  }), [registerSection, scrollToSection]);
  
  return (
    <ScrollContext.Provider value={contextValue}>
      {children}
    </ScrollContext.Provider>
  );
}

export function useScroll() {
  const context = useContext(ScrollContext);
  if (context === undefined) {
    throw new Error('useScroll must be used within a ScrollProvider');
  }
  return context;
}

export function useScrollSection(id: string) {
  const ref = useRef<HTMLElement>(null);
  const { registerSection } = useScroll();
  
  useEffect(() => {
    if (ref.current) {
      registerSection(id, ref as React.RefObject<HTMLElement>);
    }
  }, []);
  
  return ref;
}