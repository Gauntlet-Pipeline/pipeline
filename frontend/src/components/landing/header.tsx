import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Video } from "lucide-react";

const Header = () => {
  return (
    <header className="border-accent bg-background/95 supports-backdrop-filter:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2">
          <Video className="text-primary h-6 w-6" />
          <span className="text-xl font-bold">ClassClips</span>
        </Link>
        <Button asChild variant="default" size="default">
          <Link href="/login">Login</Link>
        </Button>
      </div>
    </header>
  );
};

export default Header;
