import myturtle as turtle
turtle.restart()

def drawcircle(x, y, r):
    turtle.penup()
    turtle.goto(x, y)
    turtle.pendown()
    turtle.circle(r)

def horn(x,y,circleNumber = 100,startAngle=0):
  turtle.speed(0)
  turtle.setheading(startAngle)
  for i in range(circleNumber):
    drawcircle(x, y, 20 + i*2)
    turtle.right(360/circleNumber)

horn(200,150,80,180)
horn(-200,0,80,0)
horn(-5,-100,80,320)
    
turtle.done()
