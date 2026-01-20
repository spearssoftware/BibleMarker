/**
 * Sample Bible Data
 * 
 * Pre-loaded sample text for testing (John 1, Romans 6).
 * This is public domain WEB (World English Bible) text.
 */

import { db } from './db';

// World English Bible - John 1 (Public Domain)
const JOHN_1 = {
  1: "In the beginning was the Word, and the Word was with God, and the Word was God.",
  2: "The same was in the beginning with God.",
  3: "All things were made through him. Without him, nothing was made that has been made.",
  4: "In him was life, and the life was the light of men.",
  5: "The light shines in the darkness, and the darkness hasn't overcome it.",
  6: "There came a man sent from God, whose name was John.",
  7: "The same came as a witness, that he might testify about the light, that all might believe through him.",
  8: "He was not the light, but was sent that he might testify about the light.",
  9: "The true light that enlightens everyone was coming into the world.",
  10: "He was in the world, and the world was made through him, and the world didn't recognize him.",
  11: "He came to his own, and those who were his own didn't receive him.",
  12: "But as many as received him, to them he gave the right to become God's children, to those who believe in his name:",
  13: "who were born, not of blood, nor of the will of the flesh, nor of the will of man, but of God.",
  14: "The Word became flesh and lived among us. We saw his glory, such glory as of the only born Son of the Father, full of grace and truth.",
  15: "John testified about him. He cried out, saying, \"This was he of whom I said, 'He who comes after me has surpassed me, for he was before me.'\"",
  16: "From his fullness we all received grace upon grace.",
  17: "For the law was given through Moses. Grace and truth were realized through Jesus Christ.",
  18: "No one has seen God at any time. The only born Son, who is in the bosom of the Father, has declared him.",
  19: "This is John's testimony, when the Jews sent priests and Levites from Jerusalem to ask him, \"Who are you?\"",
  20: "He declared, and didn't deny, but he declared, \"I am not the Christ.\"",
  21: "They asked him, \"What then? Are you Elijah?\" He said, \"I am not.\" \"Are you the prophet?\" He answered, \"No.\"",
  22: "They said therefore to him, \"Who are you? Give us an answer to take back to those who sent us. What do you say about yourself?\"",
  23: "He said, \"I am the voice of one crying in the wilderness, 'Make straight the way of the Lord,' as Isaiah the prophet said.\"",
  24: "The ones who had been sent were from the Pharisees.",
  25: "They asked him, \"Why then do you baptize if you are not the Christ, nor Elijah, nor the prophet?\"",
  26: "John answered them, \"I baptize in water, but among you stands one whom you don't know.",
  27: "He is the one who comes after me, whose sandal strap I'm not worthy to untie.\"",
  28: "These things were done in Bethany beyond the Jordan, where John was baptizing.",
  29: "The next day, he saw Jesus coming to him, and said, \"Behold, the Lamb of God, who takes away the sin of the world!",
  30: "This is he of whom I said, 'After me comes a man who is preferred before me, for he was before me.'",
  31: "I didn't know him, but for this reason I came baptizing in water, that he would be revealed to Israel.\"",
  32: "John testified, saying, \"I have seen the Spirit descending like a dove out of heaven, and it remained on him.",
  33: "I didn't recognize him, but he who sent me to baptize in water said to me, 'On whomever you will see the Spirit descending and remaining on him is he who baptizes in the Holy Spirit.'",
  34: "I have seen and have testified that this is the Son of God.\"",
  35: "Again, the next day, John was standing with two of his disciples,",
  36: "and he looked at Jesus as he walked, and said, \"Behold, the Lamb of God!\"",
  37: "The two disciples heard him speak, and they followed Jesus.",
  38: "Jesus turned and saw them following, and said to them, \"What are you looking for?\" They said to him, \"Rabbi\" (which is to say, being interpreted, Teacher), \"where are you staying?\"",
  39: "He said to them, \"Come and see.\" They came and saw where he was staying, and they stayed with him that day. It was about the tenth hour.",
  40: "One of the two who heard John and followed him was Andrew, Simon Peter's brother.",
  41: "He first found his own brother, Simon, and said to him, \"We have found the Messiah!\" (which is, being interpreted, Christ).",
  42: "He brought him to Jesus. Jesus looked at him and said, \"You are Simon the son of Jonah. You shall be called Cephas\" (which is by interpretation, Peter).",
  43: "On the next day, he was determined to go out into Galilee, and he found Philip. Jesus said to him, \"Follow me.\"",
  44: "Now Philip was from Bethsaida, the city of Andrew and Peter.",
  45: "Philip found Nathanael, and said to him, \"We have found him of whom Moses in the law and also the prophets wrote: Jesus of Nazareth, the son of Joseph.\"",
  46: "Nathanael said to him, \"Can any good thing come out of Nazareth?\" Philip said to him, \"Come and see.\"",
  47: "Jesus saw Nathanael coming to him, and said about him, \"Behold, an Israelite indeed, in whom is no deceit!\"",
  48: "Nathanael said to him, \"How do you know me?\" Jesus answered him, \"Before Philip called you, when you were under the fig tree, I saw you.\"",
  49: "Nathanael answered him, \"Rabbi, you are the Son of God! You are King of Israel!\"",
  50: "Jesus answered him, \"Because I told you, 'I saw you underneath the fig tree,' do you believe? You will see greater things than these!\"",
  51: "He said to him, \"Most certainly, I tell you all, hereafter you will see heaven opened, and the angels of God ascending and descending on the Son of Man.\"",
};

// World English Bible - Romans 6 (Public Domain)
const ROMANS_6 = {
  1: "What shall we say then? Shall we continue in sin, that grace may abound?",
  2: "May it never be! We who died to sin, how could we live in it any longer?",
  3: "Or don't you know that all of us who were baptized into Christ Jesus were baptized into his death?",
  4: "We were buried therefore with him through baptism into death, that just as Christ was raised from the dead through the glory of the Father, so we also might walk in newness of life.",
  5: "For if we have become united with him in the likeness of his death, we will also be part of his resurrection;",
  6: "knowing this, that our old man was crucified with him, that the body of sin might be done away with, so that we would no longer be in bondage to sin.",
  7: "For he who has died has been freed from sin.",
  8: "But if we died with Christ, we believe that we will also live with him,",
  9: "knowing that Christ, being raised from the dead, dies no more. Death no longer has dominion over him!",
  10: "For the death that he died, he died to sin one time; but the life that he lives, he lives to God.",
  11: "Thus consider yourselves also to be dead to sin, but alive to God in Christ Jesus our Lord.",
  12: "Therefore don't let sin reign in your mortal body, that you should obey it in its lusts.",
  13: "Don't present your members to sin as instruments of unrighteousness, but present yourselves to God as alive from the dead, and your members as instruments of righteousness to God.",
  14: "For sin will not have dominion over you, for you are not under law but under grace.",
  15: "What then? Shall we sin because we are not under law but under grace? May it never be!",
  16: "Don't you know that when you present yourselves as servants and obey someone, you are the servants of whomever you obey, whether of sin to death, or of obedience to righteousness?",
  17: "But thanks be to God that, whereas you were bondservants of sin, you became obedient from the heart to that form of teaching to which you were delivered.",
  18: "Being made free from sin, you became bondservants of righteousness.",
  19: "I speak in human terms because of the weakness of your flesh; for as you presented your members as servants to uncleanness and to wickedness upon wickedness, even so now present your members as servants to righteousness for sanctification.",
  20: "For when you were servants of sin, you were free from righteousness.",
  21: "What fruit then did you have at that time in the things of which you are now ashamed? For the end of those things is death.",
  22: "But now, being made free from sin and having become servants of God, you have your fruit of sanctification and the result of eternal life.",
  23: "For the wages of sin is death, but the free gift of God is eternal life in Christ Jesus our Lord.",
};

// World English Bible - Genesis 1 (Public Domain)
const GENESIS_1 = {
  1: "In the beginning, God created the heavens and the earth.",
  2: "The earth was formless and empty. Darkness was on the surface of the deep and God's Spirit was hovering over the surface of the waters.",
  3: "God said, \"Let there be light,\" and there was light.",
  4: "God saw the light, and saw that it was good. God divided the light from the darkness.",
  5: "God called the light \"day\", and the darkness he called \"night\". There was evening and there was morning, the first day.",
  6: "God said, \"Let there be an expanse in the middle of the waters, and let it divide the waters from the waters.\"",
  7: "God made the expanse, and divided the waters which were under the expanse from the waters which were above the expanse; and it was so.",
  8: "God called the expanse \"sky\". There was evening and there was morning, a second day.",
  9: "God said, \"Let the waters under the sky be gathered together to one place, and let the dry land appear;\" and it was so.",
  10: "God called the dry land \"earth\", and the gathering together of the waters he called \"seas\". God saw that it was good.",
  11: "God said, \"Let the earth yield grass, herbs yielding seeds, and fruit trees bearing fruit after their kind, with their seeds in it, on the earth;\" and it was so.",
  12: "The earth yielded grass, herbs yielding seed after their kind, and trees bearing fruit, with their seeds in it, after their kind; and God saw that it was good.",
  13: "There was evening and there was morning, a third day.",
  14: "God said, \"Let there be lights in the expanse of the sky to divide the day from the night; and let them be for signs to mark seasons, days, and years;",
  15: "and let them be for lights in the expanse of the sky to give light on the earth;\" and it was so.",
  16: "God made the two great lights: the greater light to rule the day, and the lesser light to rule the night. He also made the stars.",
  17: "God set them in the expanse of the sky to give light to the earth,",
  18: "and to rule over the day and over the night, and to divide the light from the darkness. God saw that it was good.",
  19: "There was evening and there was morning, a fourth day.",
  20: "God said, \"Let the waters abound with living creatures, and let birds fly above the earth in the open expanse of the sky.\"",
  21: "God created the large sea creatures and every living creature that moves, with which the waters swarmed, after their kind, and every winged bird after its kind. God saw that it was good.",
  22: "God blessed them, saying, \"Be fruitful, and multiply, and fill the waters in the seas, and let birds multiply on the earth.\"",
  23: "There was evening and there was morning, a fifth day.",
  24: "God said, \"Let the earth produce living creatures after their kind, livestock, creeping things, and animals of the earth after their kind;\" and it was so.",
  25: "God made the animals of the earth after their kind, and the livestock after their kind, and everything that creeps on the ground after its kind. God saw that it was good.",
  26: "God said, \"Let's make man in our image, after our likeness. Let them have dominion over the fish of the sea, and over the birds of the sky, and over the livestock, and over all the earth, and over every creeping thing that creeps on the earth.\"",
  27: "God created man in his own image. In God's image he created him; male and female he created them.",
  28: "God blessed them. God said to them, \"Be fruitful, multiply, fill the earth, and subdue it. Have dominion over the fish of the sea, over the birds of the sky, and over every living thing that moves on the earth.\"",
  29: "God said, \"Behold, I have given you every herb yielding seed, which is on the surface of all the earth, and every tree, which bears fruit yielding seed. It will be your food.",
  30: "To every animal of the earth, and to every bird of the sky, and to everything that creeps on the earth, in which there is life, I have given every green herb for food;\" and it was so.",
  31: "God saw everything that he had made, and, behold, it was very good. There was evening and there was morning, a sixth day.",
};

/**
 * Load sample data into the database
 */
export async function loadSampleData(): Promise<void> {
  // Check if already loaded
  const existing = await db.chapterCache.get('WEB:John:1');
  if (existing) {
    return; // Already loaded
  }

  // Register the WEB module (using deprecated ModuleRecord interface)
  await db.modules.put({
    id: 'WEB',
    status: 'installed',
  });

  // Load sample chapters
  await db.chapterCache.bulkPut([
    {
      id: 'WEB:John:1',
      moduleId: 'WEB',
      book: 'John',
      chapter: 1,
      verses: JOHN_1,
      cachedAt: new Date(),
    },
    {
      id: 'WEB:Rom:6',
      moduleId: 'WEB',
      book: 'Rom',
      chapter: 6,
      verses: ROMANS_6,
      cachedAt: new Date(),
    },
    {
      id: 'WEB:Gen:1',
      moduleId: 'WEB',
      book: 'Gen',
      chapter: 1,
      verses: GENESIS_1,
      cachedAt: new Date(),
    },
  ]);
}
