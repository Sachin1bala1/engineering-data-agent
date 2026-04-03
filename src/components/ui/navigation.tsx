import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { 
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, X, BarChart3, Upload, FileSpreadsheet, Network } from "lucide-react";

export function Navigation() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const navigationItems = [
    { name: "Home", href: "/", icon: null },
    { name: "Upload Excel", href: "/upload", icon: Upload },
    { name: "Analytics", href: "/analytics", icon: BarChart3 },
    { name: "Knowledge Twin", href: "/knowledge-twin", icon: Network },
    // { name: "Upload & Analyze", href: "/uploadandanalyze", icon: Upload },
    { name: "Features", href: "/features", icon: null },
    { name: "About", href: "/about", icon: null },
    { name: "Blog", href: "/blog", icon: null },
    { name: "Contact", href: "/contact", icon: null },
  ];

  const isActivePath = (href: string) => {
    if (href === "/") return location.pathname === "/";
    return location.pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link 
          to="/" 
          className="flex items-center space-x-2 hover:opacity-80 transition-opacity"
        >
          <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-br from-primary to-accent rounded-md">
            <FileSpreadsheet className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-gradient">Engineering data agent</span>
        </Link>

        {/* Desktop Navigation */}
        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            {navigationItems.map((item) => (
              <NavigationMenuItem key={item.name}>
                <NavigationMenuLink asChild>
                  <Link
                    to={item.href}
                    className={cn(
                      "group inline-flex h-10 w-max items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50 data-[active]:bg-accent/50 data-[state=open]:bg-accent/50",
                      isActivePath(item.href) && "bg-accent text-accent-foreground"
                    )}
                  >
                    {item.icon && <item.icon className="w-4 h-4 mr-2" />}
                    {item.name}
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>

        {/* CTA Button - Desktop */}
        <div className="hidden md:flex items-center space-x-4">
          {!isActivePath("/upload") && !isActivePath("/analytics") && (
            <Button asChild className="bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90">
              <Link to="/upload">
                <Upload className="w-4 h-4 mr-2" />
                Start Analysis
              </Link>
            </Button>
          )}
          {isActivePath("/analytics") && (
            <Button asChild variant="outline">
              <Link to="/upload">
                <Upload className="w-4 h-4 mr-2" />
                New Upload
              </Link>
            </Button>
          )}
        </div>

        {/* Mobile Navigation */}
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="sm">
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-80">
            <div className="flex flex-col h-full">
              {/* Mobile Logo */}
              <div className="flex items-center space-x-2 mb-8">
                <div className="flex items-center justify-center w-8 h-8 bg-gradient-to-br from-primary to-accent rounded-md">
                  <FileSpreadsheet className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold text-gradient">Engineering data agent</span>
              </div>

              {/* Mobile Navigation Items */}
              <nav className="flex-1">
                <div className="space-y-2">
                  {navigationItems.map((item) => (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={() => setIsOpen(false)}
                      className={cn(
                        "flex items-center space-x-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                        isActivePath(item.href) && "bg-accent text-accent-foreground"
                      )}
                    >
                      {item.icon && <item.icon className="w-4 h-4" />}
                      <span>{item.name}</span>
                    </Link>
                  ))}
                </div>
              </nav>

              {/* Mobile CTA */}
              <div className="border-t pt-4 mt-4">
                {!isActivePath("/upload") && !isActivePath("/analytics") && (
                  <Button 
                    asChild 
                    className="w-full bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90"
                    onClick={() => setIsOpen(false)}
                  >
                    <Link to="/upload">
                      <Upload className="w-4 h-4 mr-2" />
                      Start Analysis
                    </Link>
                  </Button>
                )}
                {isActivePath("/analytics") && (
                  <Button 
                    asChild 
                    variant="outline" 
                    className="w-full"
                    onClick={() => setIsOpen(false)}
                  >
                    <Link to="/upload">
                      <Upload className="w-4 h-4 mr-2" />
                      New Upload
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
