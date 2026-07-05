"use client";

import { useActionState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buyTicketAction, setTicketPriceAction, tipAction } from "@/app/actions";
import { RULES } from "@/lib/config";
import { useToast } from "./Toast";

export function BuyTicketButton({
  movieId,
  price,
  affordable,
}: {
  movieId: string;
  price: number;
  affordable: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  return (
    <button
      className="btn btn-primary btn-lg"
      disabled={pending || !affordable}
      onClick={() =>
        start(async () => {
          const res = await buyTicketAction(movieId);
          if (!res.ok) toast(res.error, "error");
          else {
            toast(price === 0 ? "Enjoy the show." : `Ticket purchased · ${price} cr`, "success");
            router.refresh();
          }
        })
      }
    >
      {pending ? "…" : price === 0 ? "▶ Watch free" : `▶ Buy ticket · ${price} cr`}
    </button>
  );
}

export function TipForm({ movieId }: { movieId: string }) {
  const [state, formAction, pending] = useActionState(tipAction.bind(null, movieId), null);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (state?.ok) {
      toast("Tip sent — the director thanks you.", "success");
      router.refresh();
    } else if (state && !state.ok) {
      toast(state.error, "error");
    }
  }, [state, router, toast]);

  return (
    <form action={formAction} className="inline-form">
      <input className="control" name="amount" type="number" min={1} max={1000} defaultValue={10} />
      <button className="btn btn-green btn-sm" type="submit" disabled={pending}>
        {pending ? "…" : "Send tip"}
      </button>
    </form>
  );
}

export function TicketPriceForm({ movieId, price }: { movieId: string; price: number }) {
  const [state, formAction, pending] = useActionState(setTicketPriceAction.bind(null, movieId), null);
  const { toast } = useToast();

  useEffect(() => {
    if (state?.ok) toast("Ticket price updated.", "success");
    else if (state && !state.ok) toast(state.error, "error");
  }, [state, toast]);

  return (
    <form action={formAction} className="inline-form">
      <input
        className="control"
        name="ticketPrice"
        type="number"
        min={RULES.MIN_TICKET_PRICE}
        max={RULES.MAX_TICKET_PRICE}
        defaultValue={price}
      />
      <button className="btn btn-sm" type="submit" disabled={pending}>
        {pending ? "…" : "Save"}
      </button>
    </form>
  );
}
