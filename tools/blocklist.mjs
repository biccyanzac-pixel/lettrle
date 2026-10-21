// Words never used as an answer (they stay valid as guesses). Slurs, sexual and bodily words, violence, drugs,
// and words likely to upset someone when they're the word of the day. Add freely; it only affects new builds.
export const BLOCK = new Set(`
  arses bitch bitchy boner boobs booby bosom bowel bowels busty butts crack cocks cocky condom crotch dildo dicks
  dyked dykes enema faggy fanny farts fatty feces fecal gonad gonads goony gypsy hooch horny hussy idiot jizz kinky
  lesbo loins lusty moron nazis nigga negro nudes nudie nympho orgasm orgies orgy penis penes perve pervy pimps
  piss pissy porno porny prick pubes pubic pussy queer rapes raped rapist sadism semen sexed sexes sexy shits shite
  sissy slave slaves slags slutty sluts smegma sodomy sperm spunk stoned stupid suicide teats tits titty turds
  twats urine vagina vulva whore wanks wanker willy wench bigot ghetto heroin opium cocaine crack junkie lynch
  lynched abort aborts murder killer genocide hitler incest pedal retard retards spastic cripple tranny midget
  jihad fatwa rabbis shiite sunni quran bible jesus christ satan devil demon kill kills dying death coffin corpse
  cancer tumor tumour leper lepers bullet rifle pistol bomb bombs bomber gunman sniper terror hostage stab stabs
  vomit pukes puked barfs farty snots booze drunk tipsy dopey druggy weeds stoner blunt bongs
  breast breasts nipple nipples thighs buttock rectum anus anal colon spank spanks strip stripper erotic
  lewd sleazy seduce kinks fetish harlot hooker brothel pimp
`.trim().split(/\s+/));
