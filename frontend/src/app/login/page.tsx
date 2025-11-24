import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { AuthForm } from "@/components/login/auth-form";
import Image from "next/image";

// Ensure this route runs in Node.js runtime (not edge) for database access
export const runtime = "nodejs";

type SearchParams = Promise<{
  error?: string;
  success?: string;
  mode?: string;
}>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  const params = await searchParams;
  const error = params?.error;
  const success = params?.success;
  const mode = params?.mode === "signup" ? "signup" : "login";

  // Redirect if already logged in (middleware also handles this, but good to have here too)
  if (session) {
    redirect("/dashboard/create");
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden"
      style={{
        backgroundImage: "url(/1.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* White overlay to match hero opacity */}
      <div className="pointer-events-none absolute inset-0 bg-white opacity-70" />

      {/* Scattered educational doodles - Upper right */}
      <Image
        src="/Doodles/Asset 5.svg"
        alt=""
        width={60}
        height={60}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          top: "clamp(2rem, 3vh, 3rem)",
          right: "clamp(1rem, 4vw, 4rem)",
          width: "clamp(45px, 3.5vw, 60px)",
          height: "clamp(45px, 3.5vw, 60px)",
          zIndex: 1,
          transform: "rotate(-12deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />
      <Image
        src="/Doodles/Asset 23.svg"
        alt=""
        width={50}
        height={50}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          top: "clamp(1rem, 2vh, 2rem)",
          right: "clamp(10rem, 18vw, 18rem)",
          width: "clamp(40px, 3vw, 50px)",
          height: "clamp(40px, 3vw, 50px)",
          zIndex: 1,
          transform: "rotate(15deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />
      <Image
        src="/Doodles/Asset 8.svg"
        alt=""
        width={65}
        height={65}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          top: "clamp(8rem, 12vh, 12rem)",
          right: "clamp(1rem, 5vw, 5rem)",
          width: "clamp(50px, 3.8vw, 65px)",
          height: "clamp(50px, 3.8vw, 65px)",
          zIndex: 1,
          transform: "rotate(-18deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />
      <Image
        src="/Doodles/Asset 14.svg"
        alt=""
        width={58}
        height={58}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          top: "clamp(7rem, 11vh, 11rem)",
          right: "clamp(14rem, 24vw, 24rem)",
          width: "clamp(44px, 3.4vw, 58px)",
          height: "clamp(44px, 3.4vw, 58px)",
          zIndex: 1,
          transform: "rotate(-11deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />
      <Image
        src="/Doodles/Asset 77.svg"
        alt=""
        width={70}
        height={70}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          top: "calc(25% + clamp(0rem, 1vh, 1rem))",
          right: "clamp(3rem, 7vw, 7rem)",
          width: "clamp(52px, 4vw, 70px)",
          height: "clamp(52px, 4vw, 70px)",
          zIndex: 1,
          transform: "rotate(10deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />

      {/* Upper left */}
      <Image
        src="/Doodles/Asset 18.svg"
        alt=""
        width={70}
        height={70}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          top: "clamp(2rem, 4vh, 4rem)",
          left: "clamp(2rem, 5vw, 5rem)",
          width: "clamp(52px, 4vw, 70px)",
          height: "clamp(52px, 4vw, 70px)",
          zIndex: 1,
          transform: "rotate(-8deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />
      <Image
        src="/Doodles/Asset 31.svg"
        alt=""
        width={55}
        height={55}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          top: "clamp(6rem, 10vh, 10rem)",
          left: "clamp(8rem, 14vw, 14rem)",
          width: "clamp(42px, 3.2vw, 55px)",
          height: "clamp(42px, 3.2vw, 55px)",
          zIndex: 1,
          transform: "rotate(12deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />
      <Image
        src="/Doodles/Asset 42.svg"
        alt=""
        width={65}
        height={65}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          top: "clamp(1rem, 2vh, 2rem)",
          left: "clamp(10rem, 18vw, 18rem)",
          width: "clamp(48px, 3.8vw, 65px)",
          height: "clamp(48px, 3.8vw, 65px)",
          zIndex: 1,
          transform: "rotate(-15deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />
      <Image
        src="/Doodles/Asset 25.svg"
        alt=""
        width={58}
        height={58}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          top: "clamp(4rem, 7vh, 7rem)",
          left: "clamp(6rem, 10vw, 10rem)",
          width: "clamp(44px, 3.4vw, 58px)",
          height: "clamp(44px, 3.4vw, 58px)",
          zIndex: 1,
          transform: "rotate(16deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />
      <Image
        src="/Doodles/Asset 27.svg"
        alt=""
        width={72}
        height={72}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          top: "clamp(8rem, 14vh, 14rem)",
          left: "clamp(14rem, 24vw, 24rem)",
          width: "clamp(54px, 4.2vw, 72px)",
          height: "clamp(54px, 4.2vw, 72px)",
          zIndex: 1,
          transform: "rotate(9deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />
      <Image
        src="/Doodles/Asset 48.svg"
        alt=""
        width={66}
        height={66}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          top: "calc(33.33% - clamp(1rem, 2vh, 2rem))",
          left: "clamp(6rem, 11vw, 11rem)",
          width: "clamp(50px, 3.9vw, 66px)",
          height: "clamp(50px, 3.9vw, 66px)",
          zIndex: 1,
          transform: "rotate(14deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />

      {/* Lower right */}
      <Image
        src="/Doodles/Asset 56.svg"
        alt=""
        width={75}
        height={75}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          bottom: "clamp(2rem, 5vh, 5rem)",
          right: "clamp(2rem, 5vw, 5rem)",
          width: "clamp(55px, 4.2vw, 75px)",
          height: "clamp(55px, 4.2vw, 75px)",
          zIndex: 1,
          transform: "rotate(10deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />
      <Image
        src="/Doodles/Asset 67.svg"
        alt=""
        width={60}
        height={60}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          bottom: "clamp(1rem, 3vh, 3rem)",
          right: "clamp(10rem, 16vw, 16rem)",
          width: "clamp(46px, 3.5vw, 60px)",
          height: "clamp(46px, 3.5vw, 60px)",
          zIndex: 1,
          transform: "rotate(-10deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />
      <Image
        src="/Doodles/Asset 63.svg"
        alt=""
        width={68}
        height={68}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          bottom: "clamp(4rem, 9vh, 9rem)",
          right: "clamp(6rem, 11vw, 11rem)",
          width: "clamp(50px, 4vw, 68px)",
          height: "clamp(50px, 4vw, 68px)",
          zIndex: 1,
          transform: "rotate(13deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />
      <Image
        src="/Doodles/Asset 33.svg"
        alt=""
        width={54}
        height={54}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          top: "calc(66.67% - clamp(1rem, 2vh, 2rem))",
          right: "clamp(6rem, 11vw, 11rem)",
          width: "clamp(40px, 3.2vw, 54px)",
          height: "clamp(40px, 3.2vw, 54px)",
          zIndex: 1,
          transform: "rotate(-16deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />
      <Image
        src="/Doodles/Asset 55.svg"
        alt=""
        width={60}
        height={60}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          bottom: "clamp(6rem, 12vh, 12rem)",
          right: "clamp(12rem, 20vw, 20rem)",
          width: "clamp(46px, 3.5vw, 60px)",
          height: "clamp(46px, 3.5vw, 60px)",
          zIndex: 1,
          transform: "rotate(-13deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />
      <Image
        src="/Doodles/Asset 80.svg"
        alt=""
        width={68}
        height={68}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          top: "calc(75% - clamp(1rem, 2vh, 2rem))",
          right: "clamp(8rem, 15vw, 15rem)",
          width: "clamp(50px, 4vw, 68px)",
          height: "clamp(50px, 4vw, 68px)",
          zIndex: 1,
          transform: "rotate(12deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />

      {/* Lower left */}
      <Image
        src="/Doodles/Asset 73.svg"
        alt=""
        width={62}
        height={62}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          bottom: "clamp(3rem, 6vh, 6rem)",
          left: "clamp(6rem, 11vw, 11rem)",
          width: "clamp(46px, 3.6vw, 62px)",
          height: "clamp(46px, 3.6vw, 62px)",
          zIndex: 1,
          transform: "rotate(-14deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />
      <Image
        src="/Doodles/Asset 52.svg"
        alt=""
        width={70}
        height={70}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          bottom: "clamp(1rem, 4vh, 4rem)",
          left: "clamp(1rem, 4vw, 4rem)",
          width: "clamp(52px, 4vw, 70px)",
          height: "clamp(52px, 4vw, 70px)",
          zIndex: 1,
          transform: "rotate(-12deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />
      <Image
        src="/Doodles/Asset 76.svg"
        alt=""
        width={56}
        height={56}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          top: "calc(50% + clamp(1rem, 2vh, 2rem))",
          left: "clamp(3rem, 7vw, 7rem)",
          width: "clamp(42px, 3.3vw, 56px)",
          height: "clamp(42px, 3.3vw, 56px)",
          zIndex: 1,
          transform: "rotate(-8deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />
      <Image
        src="/Doodles/Asset 74.svg"
        alt=""
        width={52}
        height={52}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          bottom: "calc(25% - clamp(1rem, 2vh, 2rem))",
          left: "clamp(14rem, 24vw, 24rem)",
          width: "clamp(40px, 3vw, 52px)",
          height: "clamp(40px, 3vw, 52px)",
          zIndex: 1,
          transform: "rotate(-15deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />

      {/* Center scattered doodles */}
      <Image
        src="/Doodles/Asset 45.svg"
        alt=""
        width={65}
        height={65}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          top: "calc(33.33% + clamp(0rem, 2vh, 2rem))",
          right: "clamp(4rem, 8vw, 8rem)",
          width: "clamp(48px, 3.8vw, 65px)",
          height: "clamp(48px, 3.8vw, 65px)",
          zIndex: 1,
          transform: "rotate(18deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />
      <Image
        src="/Doodles/Asset 61.svg"
        alt=""
        width={50}
        height={50}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          top: "calc(50% - clamp(1rem, 2vh, 2rem))",
          right: "clamp(16rem, 22vw, 22rem)",
          width: "clamp(38px, 3vw, 50px)",
          height: "clamp(38px, 3vw, 50px)",
          zIndex: 1,
          transform: "rotate(6deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />
      <Image
        src="/Doodles/Asset 79.svg"
        alt=""
        width={55}
        height={55}
        className="text-foreground pointer-events-none absolute hidden opacity-100 lg:block"
        style={{
          bottom: "calc(33.33% + clamp(1rem, 2vh, 2rem))",
          right: "clamp(20rem, 28vw, 28rem)",
          width: "clamp(42px, 3.2vw, 55px)",
          height: "clamp(42px, 3.2vw, 55px)",
          zIndex: 1,
          transform: "rotate(11deg)",
          filter:
            "brightness(0) saturate(100%) invert(22%) sepia(43%) saturate(1847%) hue-rotate(226deg) brightness(91%) contrast(91%)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-1 flex-col justify-center px-4 py-10 lg:px-6">
        <AuthForm error={error} success={success} defaultTab={mode} />
      </div>
    </div>
  );
}
