"use client";

import { useEffect } from "react";

export default function MarketingScripts() {
  useEffect(() => {
    // ── Navbar scroll behaviour
    const navbar = document.getElementById("navbar");
    const onScroll = () => {
      if (!navbar) return;
      if (window.scrollY > 20) navbar.classList.add("scrolled");
      else navbar.classList.remove("scrolled");
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // ── Mobile menu toggle
    const toggle = document.getElementById("navToggle");
    const menu = document.getElementById("navMobile");
    const iconMenu = document.getElementById("iconMenu");
    const iconClose = document.getElementById("iconClose");

    const onToggle = () => {
      if (!menu || !toggle) return;
      const isOpen = menu.classList.toggle("open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      if (iconMenu) (iconMenu as HTMLElement).style.display = isOpen ? "none" : "block";
      if (iconClose) (iconClose as HTMLElement).style.display = isOpen ? "block" : "none";
    };
    toggle?.addEventListener("click", onToggle);

    // closeMobileMenu helper (optional, exposed on window so your Navbar links can call it)
    (window as any).closeMobileMenu = () => {
      if (menu) menu.classList.remove("open");
      if (toggle) toggle.setAttribute("aria-expanded", "false");
      if (iconMenu) (iconMenu as HTMLElement).style.display = "block";
      if (iconClose) (iconClose as HTMLElement).style.display = "none";
    };

    // ── Fade-up animations
    const elements = Array.from(document.querySelectorAll(".fade-up")) as HTMLElement[];
    let observer: IntersectionObserver | null = null;

    const checkVisibility = () => {
      elements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.92) el.classList.add("visible");
      });
    };

    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              (entry.target as HTMLElement).classList.add("visible");
              observer?.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
      );
      elements.forEach((el) => observer!.observe(el));
    } else {
      (window as Window).addEventListener("scroll", checkVisibility, { passive: true });
    }
    checkVisibility();

    // ── Smooth scroll for anchors
    const anchors = Array.from(document.querySelectorAll('a[href^="#"]')) as HTMLAnchorElement[];
    const onAnchorClick = (e: Event) => {
      const a = e.currentTarget as HTMLAnchorElement;
      const href = a.getAttribute("href");
      if (!href) return;

      const target = document.querySelector(href);
      if (!target) return;

      e.preventDefault();
      const navHeight = document.getElementById("navbar")?.offsetHeight ?? 64;
      const top = target.getBoundingClientRect().top + window.scrollY - navHeight - 8;
      window.scrollTo({ top, behavior: "smooth" });
    };
    anchors.forEach((a) => a.addEventListener("click", onAnchorClick));

    return () => {
      window.removeEventListener("scroll", onScroll);
      toggle?.removeEventListener("click", onToggle);
      if (!("IntersectionObserver" in window)) (window as Window).removeEventListener("scroll", checkVisibility);
      observer?.disconnect();
      anchors.forEach((a) => a.removeEventListener("click", onAnchorClick));
      delete (window as any).closeMobileMenu;
    };
  }, []);

  return null;
}