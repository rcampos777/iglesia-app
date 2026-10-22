-- Visión y fundamentos de fe del sitio público (docs/site.md).
-- Texto tomado de la hoja impresa "Nuestra fe" de la iglesia (2026-10-21).
-- Solo se llena lo que esté vacío: no pisa lo que ya escribió un editor.

alter table site_settings
  add column vision_text text check (char_length(vision_text) <= 300),
  add column beliefs_text text check (char_length(beliefs_text) <= 12000);

update site_settings set vision_text = 'Establecer el Reino de Dios en la Tierra.'
where vision_text is null;

update site_settings set mission_text =
  'La evangelización local, nacional e internacional, de acuerdo a las instrucciones dadas por nuestro Señor Jesucristo (Mateo 28:19-20; Hechos 1:8).'
where mission_text is null;

update site_settings set beliefs_text = $beliefs$Creemos que la Biblia es la Palabra inspirada por Dios y es nuestra constitución; en ella está documentada la voluntad y propósitos de Dios. Es la Biblia nuestra única regla de fe, doctrina y conducta (2 Pedro 1:21; 2 Timoteo 3:16-17).

Creemos en un Dios trino, manifestado en tres personas: el Padre, el Hijo y el Espíritu Santo (2 Corintios 13:14; Mateo 3:16-17).

Creemos en la Deidad de Jesucristo, su nacimiento virginal, su muerte redentora, su resurrección corporal, su ascensión a la diestra del Dios Padre (1 Timoteo 3:16). Reconocemos el Señorío de Jesucristo sobre todas las cosas en el cielo, la tierra y debajo de la tierra (Filipenses 2:9-10).

Creemos que el hombre fue creado en un estado de perfección, justicia y santidad, y que cayó y vive en un estado de muerte espiritual hasta que sea redimido, por medio de la fe en la gracia de Dios y en la sangre del Señor Jesucristo (Romanos 3:23-25; Efesios 2:1-2).

Creemos en la inhabilidad del hombre para salvarse a sí mismo, por medio de obras meritorias y religiosas; y que solo puede llegar a Dios por medio de su fe en la gracia de Dios, en la obra perfecta y completa de nuestro Señor Jesucristo (Efesios 2:8-9; Romanos 5:1-2).

Creemos en el Bautismo en agua por inmersión, como un tipo de la muerte y resurrección del creyente, y como una manifestación de fe y obediencia a la ordenanza del Señor Jesucristo (Mateo 28:19; 1 Pedro 3:21; Romanos 6:3-4).

Creemos en el Bautismo en el Espíritu Santo como una experiencia posterior, separada de la salvación, el cual es necesario para operar en una vida de poder, manifestar los dones del Espíritu y establecer el gobierno de Dios en la tierra (Lucas 3:16; Hechos 1:8; Hechos 2:4).

Creemos que la Iglesia está compuesta por todos aquellos que invocan el nombre del Señor Jesucristo y viven una vida separada del pecado. La Iglesia es un organismo espiritual instituido por el mismo Jesús, y como tal, es su representante en la tierra. Sus miembros tienen la sagrada responsabilidad de trabajar, contribuir y orar para su continuo crecimiento. La iglesia tiene el derecho divino de expulsar miembros que se constituyen en una amenaza para la salud de la misma (Efesios 1:22-23; Hechos 2:41-42; Mateo 16:18-19; Mateo 18:15-20).

Creemos que la voluntad de Dios es la santificación del creyente, como un producto de la vida de Jesús en él, la autoridad de la Palabra y el poder del Espíritu Santo (Gálatas 2:20; Juan 17:17; 1 Corintios 6:11; 1 Tesalonicenses 5:23-24).

Creemos que para agradar a Dios y ser sus embajadores en la tierra, el creyente nacido de nuevo debe vivir una vida de separación del mundo y sus prácticas pecaminosas. Todo lo que tenga apariencia de pecado debe ser evitado como un testimonio al mundo de que somos el pueblo escogido de Dios (1 Pedro 2:9; Mateo 5:16; 1 Juan 2:15-17; 2 Timoteo 2:19-21; 1 Tesalonicenses 5:22; Santiago 4:4-5). Por lo tanto, no aceptamos que los ministros y miembros de la iglesia sean miembros activos de asociaciones secretas u organizaciones con principios fuera de la Palabra de Dios (Efesios 5:8-13).

Creemos que la voluntad perfecta de Dios es la sanidad física de todos los creyentes y se recibe por fe y por la imposición de manos (Isaías 53:4-5; 1 Pedro 2:24-25; Santiago 5:14-15).

Creemos que los cinco ministerios de Efesios 4:11 (Apóstoles, Profetas, Evangelistas, Pastores y Maestros) están activos hoy en día en la Iglesia y son básicos y fundamentales para el buen funcionamiento y crecimiento del Cuerpo del Señor Jesucristo (Efesios 2:20; 1 Corintios 12:28).

Creemos que la misión de la Iglesia es la evangelización local, nacional e internacional, de acuerdo a las instrucciones dadas por nuestro Señor Jesucristo (Mateo 28:19-20; Hechos 1:8).

Creemos en la adoración y alabanza al Señor en espíritu y en verdad, por medio de las manifestaciones sugeridas y aprobadas por la Palabra de Dios (Juan 4:23-24; Filipenses 3:3; Salmos 150).

Creemos que la familia es la base fundamental de la sociedad y de la Iglesia (Génesis 2:21-24; Efesios 5:21-33).

Creemos en las siguientes prácticas basadas en la autoridad de las Sagradas Escrituras: la presentación de niños al Señor (no bautismo de infantes), como un acto de fe del pacto de los padres y como una identificación pública del niño con la iglesia (Mateo 19:13-14; 1 Corintios 7:14). Los diezmos y ofrendas como el medio autorizado por Dios para sostener su obra; también creemos en el dar limosnas para ayudar a los pobres y desamparados, así como en el dar primicias y sembrar para cosechar (Malaquías 3:10; 2 Corintios 9:5-14). El Pacto Matrimonial: creemos en la santidad del Matrimonio instituido por Dios para la preservación de la raza humana. El único matrimonio endosado por las Sagradas Escrituras y practicado por este ministerio es la unión entre un hombre y una mujer. En cuanto al divorcio, creemos que es tolerado por Dios desde el Antiguo Testamento pero no autorizado. Nos suscribimos a la enseñanza de Jesús de que la única razón legal para el divorcio en el creyente es la fornicación de uno de los cónyuges (Hebreos 13:4; Efesios 5:25-33; 1 Corintios 7:1-5). La práctica continua de la Santa Cena, como un recordatorio de la muerte de Jesús y como una experiencia viva y actual con Jesús y con los miembros de su Iglesia (Mateo 26:26-29; 1 Corintios 11:23-34). Creemos en todo lo que nos enseña la santa cena del Señor: salvación, libertad, redención, prosperidad y el regreso de nuestro Señor Jesucristo.

Creemos que los creyentes que son santificados en la sangre de Jesús, al morir en el Señor, van inmediatamente a Su Presencia; pero los pecadores que mueren después de haber rechazado a Jesucristo como Señor y Salvador van a un lugar llamado Infierno, donde son atormentados hasta el día de la resurrección para ir al juicio final (Filipenses 1:20-23; Romanos 14:7-9; Mateo 23:33; Apocalipsis 20:13).

Creemos en el regreso de nuestro Señor Jesucristo en forma corporal y visible, en la resurrección de los muertos, en el establecimiento de su reino milenial, en el juicio final para todos los hombres, y en los cielos nuevos y tierra nueva, donde moraremos eternamente con Dios (1 Tesalonicenses 4:13-17; Hechos 1:11; Apocalipsis 21:1-4).

Reconocemos que el gobierno humano es una institución puesta por Dios para la preservación del orden, paz, seguridad y bienestar; reconocemos, sin venerar, los símbolos patrios del mismo (Romanos 13:1-6; 1 Pedro 2:13-14).$beliefs$
where beliefs_text is null;
