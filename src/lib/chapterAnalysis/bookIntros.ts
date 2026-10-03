/**
 * Book intros — hand-authored setting notes for every book of the Bible.
 *
 * Rules for every entry:
 * — Factual setting only: author, audience, approximate date, occasion.
 *   Never meaning, theme, or application; that is the reader's to find.
 * — Where authorship or dating is disputed, say "traditionally attributed
 *   to…" or "traditional dating" rather than taking a side.
 * — One to three sentences. No abbreviations with periods ("BC", not
 *   "B.C."), so the sentence-count test can split on terminal punctuation.
 */

export const BOOK_INTRO: Record<string, string> = {
  Gen: 'Traditionally attributed to Moses, Genesis opens the five books of the Law. It moves from creation to the family of Abraham, Isaac, and Jacob, and ends with Jacob\'s family settled in Egypt.',
  Exod: 'Traditionally attributed to Moses, Exodus follows Israel from slavery in Egypt to Mount Sinai. It records the covenant given there and the building of the tabernacle.',
  Lev: 'Traditionally attributed to Moses, Leviticus is set at Mount Sinai in the year after Israel left Egypt. It gathers instructions for offerings, priests, and daily life given to the people camped there.',
  Num: 'Traditionally attributed to Moses, Numbers covers about forty years of Israel\'s journey from Sinai to the plains of Moab. It takes its name from the two censuses of the people.',
  Deut: 'Traditionally attributed to Moses, Deuteronomy is set on the plains of Moab just before Israel crossed the Jordan. It is presented as Moses\'s farewell speeches to a new generation.',
  Josh: 'Named for Joshua, Moses\'s successor, and traditionally attributed to him. It covers Israel\'s entry into Canaan and the division of the land among the tribes.',
  Judg: 'Judges covers the generations between Joshua\'s death and the rise of Israel\'s kings, when tribal leaders called judges arose in times of crisis. Its author is unknown; Jewish tradition names Samuel.',
  Ruth: 'Ruth is set in the time of the judges, in Moab and Bethlehem. Its author is unknown, and it ends with a genealogy leading to King David.',
  '1Sam': '1 Samuel covers Israel\'s move from judges to kings, through the lives of Samuel, Saul, and the young David. Its author is unknown; Samuel and Kings were edited into their present form after the events they record.',
  '2Sam': '2 Samuel covers the reign of King David, around 1000 BC by traditional dating. Its author is unknown, and in the Hebrew Bible it formed one book with 1 Samuel.',
  '1Kgs': '1 Kings runs from the end of David\'s life and Solomon\'s reign to the split of Israel into northern and southern kingdoms. Its author is unknown, and it was completed during or after the exile in Babylon.',
  '2Kgs': '2 Kings continues the history of the divided kingdoms until Assyria conquers the north and Babylon destroys Jerusalem in 586 BC. Its author is unknown, and it was completed during or after the exile.',
  '1Chr': '1 Chronicles retells Israel\'s history from Adam through the reign of David, with long genealogies. Jewish tradition attributes Chronicles to Ezra, and it was written for the community after the return from exile.',
  '2Chr': '2 Chronicles continues from Solomon to the fall of Jerusalem and ends with the decree of Cyrus allowing the exiles to return. It was written after the exile, and Jewish tradition attributes it to Ezra.',
  Ezra: 'Ezra covers the first returns of Jewish exiles from Babylon to Jerusalem and the rebuilding of the temple, from about 538 BC. It is traditionally attributed to Ezra, a priest and scribe who appears in its later chapters.',
  Neh: 'Nehemiah is written largely in the first person by Nehemiah, a Jewish official at the Persian court who came to Jerusalem around 445 BC. It covers the rebuilding of the city walls and the reforms that followed.',
  Esth: 'Esther is set in the Persian capital Susa during the reign of Xerxes, in the 400s BC. Its author is unknown.',
  Job: 'Job is set in the land of Uz, outside Israel, among a man, his friends, and God. Its author and date are unknown.',
  Ps: 'Psalms is a collection of 150 songs and prayers gathered over many centuries. Many headings name David, and others name Asaph, the sons of Korah, Solomon, and Moses.',
  Prov: 'Proverbs is a collection of wise sayings, much of it attributed to King Solomon. Later sections are credited to the men of King Hezekiah, Agur, and King Lemuel.',
  Eccl: 'Ecclesiastes is presented as the words of "the Teacher, son of David, king in Jerusalem." It is traditionally attributed to Solomon.',
  Song: 'Song of Songs is a collection of love poems. Its opening line ties it to Solomon, and it is traditionally attributed to him.',
  Isa: 'Isaiah is named for the prophet who spoke in Jerusalem under four kings of Judah, roughly 740 to 700 BC. Its audience was the people of Judah facing the threat of Assyria and later Babylon.',
  Jer: 'Jeremiah prophesied in Judah for about forty years, from around 627 BC through the fall of Jerusalem in 586 BC. His scribe Baruch is named as writing down many of his words.',
  Lam: 'Lamentations is a set of five poems mourning the destruction of Jerusalem by Babylon in 586 BC. It is traditionally attributed to Jeremiah.',
  Ezek: 'Ezekiel was a priest taken to Babylon among the Jewish exiles in 597 BC. His prophecies, dated by year of the exile, were spoken to the exiles there.',
  Dan: 'Daniel is set in the royal courts of Babylon and Persia, beginning with the first deportation from Judah around 605 BC. It is traditionally attributed to Daniel, a young exile who served in those courts.',
  Hos: 'Hosea prophesied to the northern kingdom of Israel in the 700s BC, in the decades before it fell to Assyria. Hosea\'s own marriage is part of his message.',
  Joel: 'Joel is named for its prophet, the son of Pethuel, and speaks to the people of Judah after a devastating locust plague. Its date is uncertain.',
  Amos: 'Amos was a shepherd and fig farmer from Tekoa in Judah, sent to prophesy to the northern kingdom of Israel around 760 BC. It was a time of prosperity under King Jeroboam II.',
  Obad: 'Obadiah is the shortest book of the Old Testament, a prophecy about the nation of Edom. Little is known about the prophet, and its date is uncertain.',
  Jonah: 'Jonah is named for a prophet from the northern kingdom who lived in the reign of Jeroboam II, in the 700s BC. It tells of his mission to Nineveh, a capital of Assyria.',
  Mic: 'Micah came from the town of Moresheth in Judah and prophesied in the late 700s BC, the same era as Isaiah. He spoke to both Samaria and Jerusalem.',
  Nah: 'Nahum, from Elkosh, prophesied about the fall of Nineveh, the Assyrian capital, which fell in 612 BC. His message was addressed to Judah.',
  Hab: 'Habakkuk prophesied in Judah in the late 600s BC as Babylon was rising to power. The book is framed as a dialogue between the prophet and God.',
  Zeph: 'Zephaniah prophesied in Judah during the reign of King Josiah, around 630 BC. He traces his ancestry to King Hezekiah.',
  Hag: 'Haggai prophesied in Jerusalem in 520 BC to Jews who had returned from exile. His dated messages concern the rebuilding of the temple.',
  Zech: 'Zechariah, a priest and prophet, began prophesying in Jerusalem in 520 BC, alongside Haggai, to the returned exiles. The book contains night visions and later oracles.',
  Mal: 'Malachi is the last book of the Old Testament, addressed to the people of Judah after the temple was rebuilt, likely in the 400s BC. Malachi means "my messenger," and nothing else is known about the prophet.',
  Matt: 'The Gospel of Matthew is traditionally attributed to Matthew, a tax collector who became one of the twelve apostles. Written in the first century AD, it often connects Jesus\'s life to the Hebrew Scriptures.',
  Mark: 'The Gospel of Mark is traditionally attributed to John Mark, a companion of Peter and Paul. It is the shortest of the four Gospels and was written in the first century AD.',
  Luke: 'The Gospel of Luke is traditionally attributed to Luke, a physician and companion of Paul. It is addressed to a man named Theophilus and is the first of two volumes, continued in Acts.',
  John: 'The Gospel of John is traditionally attributed to the apostle John, son of Zebedee. It was written late in the first century AD, and states its own purpose near the end.',
  Acts: 'Acts is the second volume from the author of Luke, traditionally Luke, again addressed to Theophilus. It covers about thirty years, from Jesus\'s ascension to Paul under house arrest in Rome.',
  Rom: 'Paul wrote Romans to the believers in Rome, a church he had not yet visited, around AD 57. He wrote from Corinth before carrying a collection to Jerusalem.',
  '1Cor': 'Paul wrote 1 Corinthians from Ephesus around AD 55 to the church he had founded in Corinth. He was responding to reports and to a letter the church had sent him.',
  '2Cor': 'Paul wrote 2 Corinthians from Macedonia around AD 56, following a painful period with the church in Corinth. It is one of his most personal letters.',
  Gal: 'Paul wrote Galatians to churches in the Roman region of Galatia, in what is now Turkey. Its date is debated, with suggestions ranging from about AD 48 to the mid-50s.',
  Eph: 'Ephesians is a letter from Paul, written while he was in prison, to believers in Ephesus and likely the churches around it. Tradition places it during his imprisonment in Rome, around AD 60.',
  Phil: 'Paul wrote Philippians from prison to the church at Philippi, the first church he founded in Europe. The church had sent him a gift by their messenger Epaphroditus.',
  Col: 'Colossians is a letter from Paul and Timothy, written from prison to believers in Colossae. Paul had not visited the city; the church was founded through Epaphras.',
  '1Thess': '1 Thessalonians is one of Paul\'s earliest letters, written around AD 50 from Corinth. It is addressed to a young church he had to leave abruptly in Thessalonica.',
  '2Thess': '2 Thessalonians is a second letter from Paul, Silas, and Timothy to the church in Thessalonica. It was written soon after the first, likely from Corinth.',
  '1Tim': '1 Timothy is a letter from Paul to Timothy, his younger co-worker, who was leading the church in Ephesus. It is traditionally dated to the 60s AD.',
  '2Tim': '2 Timothy is written by Paul from prison in Rome, traditionally his last letter, in the mid-60s AD. He writes to Timothy and asks him to come soon.',
  Titus: 'Paul wrote this letter to Titus, a co-worker he had left on the island of Crete to organize its churches. It is traditionally dated to the 60s AD.',
  Phlm: 'Philemon is a short personal letter Paul wrote from prison to Philemon, a believer in Colossae. It concerns Onesimus, Philemon\'s slave, who had come to Paul.',
  Heb: 'Hebrews is addressed to Jewish believers in Jesus, and its author is not named. It was written in the first century AD, likely before the temple\'s destruction in AD 70.',
  Jas: 'James is a letter traditionally attributed to James, the brother of Jesus and a leader of the church in Jerusalem. It is addressed to "the twelve tribes in the Dispersion."',
  '1Pet': '1 Peter is a letter from the apostle Peter, written from "Babylon," likely meaning Rome, in the early 60s AD. It is addressed to believers scattered across provinces of Asia Minor.',
  '2Pet': '2 Peter presents itself as the apostle Peter\'s final letter, written as he expected his death soon. It is traditionally dated to the mid-60s AD.',
  '1John': '1 John is a letter traditionally attributed to the apostle John, written late in the first century AD. It names neither its author nor its recipients.',
  '2John': '2 John is a short letter from "the elder" to "the elect lady and her children," likely a church. It is traditionally attributed to the apostle John.',
  '3John': '3 John is a short letter from "the elder" to a believer named Gaius. It is traditionally attributed to the apostle John.',
  Jude: 'Jude is a short letter from Jude, who calls himself a brother of James, traditionally the brother of Jesus. Its date is uncertain.',
  Rev: 'Revelation was written by a man named John while on the island of Patmos, traditionally the apostle John. It is addressed to seven churches in Asia Minor, traditionally dated to around AD 95.',
};

export function introFor(bookId: string): string | undefined {
  return BOOK_INTRO[bookId];
}
